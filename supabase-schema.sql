-- ============================================================
-- ESQUEMA DE BASE DE DATOS — Gauss Ortopedia
-- Ejecutar UNA sola vez en Supabase: Panel > SQL Editor > New query
-- Pegar todo este archivo y darle a "Run".
-- ============================================================

create extension if not exists pgcrypto;

-- --- Tabla de pedidos (ventas y alquileres) ---
create table if not exists pedidos (
    id uuid primary key default gen_random_uuid(),
    creado_en timestamptz not null default now(),

    tipo text not null check (tipo in ('venta', 'alquiler')),
    producto_id text not null,
    producto_nombre text not null,
    cantidad integer not null default 1,
    precio_unitario integer not null,
    total integer not null,

    -- Solo se completan cuando tipo = 'alquiler'
    fecha_desde date,
    fecha_hasta date,

    -- Datos del cliente
    nombre text,
    apellido text,
    telefono text,
    dni text,
    direccion text,
    lesion text,

    -- Solo para alquileres: cuántos días dura este período (15 o 30),
    -- para poder renovarlo por la misma duración automáticamente.
    duracion_dias integer,

    -- Comprobante de transferencia para renovar el alquiler
    comprobante_url text,
    comprobante_subido_en timestamptz,
    pago_pendiente_revision boolean not null default false,
    veces_renovado integer not null default 0,
    aviso_retiro_enviado boolean not null default false,
    recordatorio_vencimiento_enviado_en timestamptz,

    -- pendiente -> recién llegado por WhatsApp
    -- confirmado -> vos ya lo confirmaste, pero todavía no lo retiró
    -- activo -> el cliente ya retiró el equipo, el alquiler está en curso
    -- devuelto -> el cliente ya devolvió el equipo (libera disponibilidad)
    -- cancelado -> no se concretó (libera disponibilidad)
    estado text not null default 'pendiente'
);

-- Si la tabla ya existía de una versión anterior, agregamos las columnas nuevas.
alter table pedidos add column if not exists telefono text;
alter table pedidos add column if not exists duracion_dias integer;
alter table pedidos add column if not exists comprobante_url text;
alter table pedidos add column if not exists comprobante_subido_en timestamptz;
alter table pedidos add column if not exists pago_pendiente_revision boolean not null default false;
alter table pedidos add column if not exists veces_renovado integer not null default 0;
alter table pedidos add column if not exists aviso_retiro_enviado boolean not null default false;
alter table pedidos add column if not exists recordatorio_vencimiento_enviado_en timestamptz;

-- Ampliamos los estados permitidos a pendiente/confirmado/activo/devuelto/cancelado
-- (sin importar cómo se llame el check constraint existente, si lo hubiera).
do $$
declare
    nombre_constraint text;
begin
    select con.conname into nombre_constraint
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'pedidos' and con.contype = 'c' and att.attname = 'estado';

    if nombre_constraint is not null then
        execute format('alter table pedidos drop constraint %I', nombre_constraint);
    end if;
end $$;

alter table pedidos add constraint pedidos_estado_check
    check (estado in ('pendiente', 'confirmado', 'activo', 'devuelto', 'cancelado'));

create index if not exists idx_pedidos_disponibilidad
    on pedidos (producto_id, tipo, estado, fecha_desde, fecha_hasta);

-- --- Seguridad a nivel de fila (RLS) ---
-- El sitio es público y anónimo: cualquier visitante puede CREAR un pedido
-- (así funciona el carrito) y puede LEER las reservas de alquiler para
-- calcular disponibilidad, pero no puede ver los datos personales de nadie
-- ni modificar/borrar pedidos. Solo un usuario logueado (vos, desde el
-- panel de administración) puede ver el detalle completo y cambiar el estado.

alter table pedidos enable row level security;

-- Cualquiera puede crear un pedido (checkout del carrito / reservas),
-- esté o no logueado (por ej. si probás un pedido en el mismo
-- navegador donde tenés abierta la sesión del panel de admin).
drop policy if exists "insertar_pedidos_publico" on pedidos;
create policy "insertar_pedidos_publico"
    on pedidos for insert
    to public
    with check (true);

-- Cualquiera puede leer SOLO lo necesario para calcular disponibilidad
-- (fechas y producto), no datos personales. Se filtra en la app, pero
-- además restringimos las columnas visibles con una vista.
drop policy if exists "leer_pedidos_publico" on pedidos;
create policy "leer_pedidos_publico"
    on pedidos for select
    to public
    using (true);

-- Actualizar (cambiar estado) y borrar: solo usuarios logueados (admin)
drop policy if exists "actualizar_pedidos_admin" on pedidos;
create policy "actualizar_pedidos_admin"
    on pedidos for update
    to authenticated
    using (true)
    with check (true);

drop policy if exists "borrar_pedidos_admin" on pedidos;
create policy "borrar_pedidos_admin"
    on pedidos for delete
    to authenticated
    using (true);

-- --- Vista pública de disponibilidad ---
-- Expone únicamente producto + fechas + tipo + estado, sin datos personales.
-- El sitio público consulta esta vista para saber si hay superposición de
-- fechas; el panel de administración consulta la tabla completa (logueado).
create or replace view disponibilidad_publica as
    select id, tipo, producto_id, fecha_desde, fecha_hasta, estado
    from pedidos
    where tipo = 'alquiler';

grant select on disponibilidad_publica to anon, authenticated;

-- ============================================================
-- COMPROBANTES DE PAGO (renovación de alquileres)
-- ============================================================

-- Bucket de Storage donde se guardan las fotos de los comprobantes.
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true)
on conflict (id) do nothing;

-- Cualquiera puede subir un comprobante (lo hace el cliente desde
-- renovar.html, sin login), pero no puede listar ni borrar los de otros.
drop policy if exists "subir_comprobantes_publico" on storage.objects;
create policy "subir_comprobantes_publico"
    on storage.objects for insert
    to public
    with check (bucket_id = 'comprobantes');

drop policy if exists "leer_comprobantes_publico" on storage.objects;
create policy "leer_comprobantes_publico"
    on storage.objects for select
    to public
    using (bucket_id = 'comprobantes');

-- Función segura: permite que un visitante SIN login marque su propio
-- pedido con un comprobante subido, sin darle permiso para tocar
-- ninguna otra columna del pedido (precio, estado, etc.).
-- Columnas para guardar la duración y el monto que el cliente elige al
-- renovar (puede ser distinto al período anterior, ej: pasar de 15 a 30
-- días de Magneto). Si quedan en null, el panel usa los valores del
-- período anterior como antes.
alter table pedidos add column if not exists renovacion_duracion_dias integer;
alter table pedidos add column if not exists renovacion_monto integer;

create or replace function subir_comprobante(
    pedido_id uuid,
    url text,
    duracion_elegida integer default null,
    monto_elegido integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update pedidos
    set comprobante_url = url,
        comprobante_subido_en = now(),
        pago_pendiente_revision = true,
        renovacion_duracion_dias = duracion_elegida,
        renovacion_monto = monto_elegido
    where id = pedido_id;
end;
$$;

grant execute on function subir_comprobante(uuid, text, integer, integer) to anon, authenticated;

-- ============================================================
-- STOCK POR VARIANTE (talles / tipos)
-- ============================================================

create table if not exists variantes_producto (
    id text primary key,              -- ej: 'muletas-chica', 'magneto-tubos'
    producto_id text not null,        -- ej: 'muletas', 'magneto'
    producto_nombre text not null,    -- ej: 'Muletas de Aluminio Regulables (par)'
    variante text not null,           -- ej: 'Chica', 'Con placas'
    stock integer not null default 0
);

-- Carga inicial de stock. Si ya existe una fila con ese id, NO la toca
-- (así no te pisa el stock si ya lo veías modificando desde el panel).
insert into variantes_producto (id, producto_id, producto_nombre, variante, stock) values
    ('muletas-chica',        'muletas',     'Muletas de Aluminio Regulables (par)', 'Chica',   10),
    ('muletas-mediana',      'muletas',     'Muletas de Aluminio Regulables (par)', 'Mediana', 30),
    ('muletas-grande',       'muletas',     'Muletas de Aluminio Regulables (par)', 'Grande',  10),
    ('bota-walker-chica',    'bota-walker', 'Bota Walker Inmovilizadora',           'Chica',   15),
    ('bota-walker-mediana',  'bota-walker', 'Bota Walker Inmovilizadora',           'Mediana', 25),
    ('bota-walker-grande',   'bota-walker', 'Bota Walker Inmovilizadora',           'Grande',  10),
    ('magneto-placas',       'magneto',     'Equipo de Magnetoterapia',             'Con placas',     100),
    ('magneto-tubos',        'magneto',     'Equipo de Magnetoterapia',             'Con tubos',      300),
    ('magneto-tubo-placas',  'magneto',     'Equipo de Magnetoterapia',             'Tubo y placas',  100)
on conflict (id) do nothing;

alter table variantes_producto enable row level security;

-- Cualquiera puede leer el stock (para calcular disponibilidad en el sitio).
drop policy if exists "leer_variantes_publico" on variantes_producto;
create policy "leer_variantes_publico"
    on variantes_producto for select
    to public
    using (true);

-- Solo vos (logueado) podés cambiar las cantidades desde el panel.
drop policy if exists "actualizar_variantes_admin" on variantes_producto;
create policy "actualizar_variantes_admin"
    on variantes_producto for update
    to authenticated
    using (true)
    with check (true);

-- ============================================================
-- FACTURACIÓN (Facturitas, carga manual por Excel)
-- ============================================================

alter table pedidos add column if not exists pendiente_facturacion boolean not null default false;
alter table pedidos add column if not exists facturado_en timestamptz;


-- ============================================================
-- EQUIPOS CON QR (una fila por cada unidad física)
-- ============================================================
-- Cada equipo tiene un código (el que lleva impreso su QR) y, si está
-- alquilado, apunta al pedido con el que salió. Libre = pedido_id vacío.

create table if not exists equipos (
    id text primary key,                                   -- ej: 'MAGNETO-PLACAS-001'
    variante_id text not null references variantes_producto(id),
    pedido_id uuid references pedidos(id) on delete set null,
    creado_en timestamptz not null default now()
);

alter table equipos enable row level security;

-- Solo vos (logueado) podés ver y manejar los equipos.
drop policy if exists "equipos_admin" on equipos;
create policy "equipos_admin"
    on equipos for all
    to authenticated
    using (true)
    with check (true);


-- ============================================================
-- CONTACTOS (agenda de clientes que se conserva aunque borres pedidos)
-- ============================================================

create table if not exists contactos (
    id uuid primary key default gen_random_uuid(),
    creado_en timestamptz not null default now(),
    nombre text,
    apellido text,
    dni text,
    telefono text,
    direccion text,
    notas text
);

alter table contactos enable row level security;

drop policy if exists "contactos_admin" on contactos;
create policy "contactos_admin"
    on contactos for all
    to authenticated
    using (true)
    with check (true);


-- ============================================================
-- REPARACION E HISTORIAL DE EQUIPOS
-- ============================================================
alter table equipos add column if not exists en_reparacion boolean not null default false;
alter table equipos add column if not exists reparacion_desde timestamptz;
alter table equipos add column if not exists reparacion_nota text;

alter table variantes_producto add column if not exists en_reparacion integer not null default 0;

create table if not exists equipos_historial (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  equipo_id text not null,
  accion text not null,
  detalle text
);

alter table equipos_historial enable row level security;

drop policy if exists "equipos_historial_admin" on equipos_historial;
create policy "equipos_historial_admin" on equipos_historial for all to authenticated using (true) with check (true);


-- ============================================================
-- PRODUCTOS NUEVOS: silla de ruedas, andador y roll out
-- (stock en 0: cargalo desde la pestana Stock del panel)
-- ============================================================
insert into variantes_producto (id, producto_id, producto_nombre, variante, stock) values
  ('silla-de-ruedas-unica', 'silla-de-ruedas', 'Silla de Ruedas', 'Modelo unico', 0),
  ('andador-con-ruedas', 'andador', 'Andador', 'Con ruedas', 0),
  ('andador-sin-ruedas', 'andador', 'Andador', 'Sin ruedas', 0),
  ('roll-out-unica', 'roll-out', 'Roll Out', 'Modelo unico', 0),
  ('eleva-inodoro-unica', 'eleva-inodoro', 'Eleva Inodoro', 'Modelo unico', 0)
on conflict (id) do nothing;
-- Unifica el Magneto: un solo equipo (un stock, un QR).
-- El modelo (placas, tubos, tubo y placas) queda en el pedido.

-- 1) Crea la variante unica "magneto" con el stock total de las tres.
insert into variantes_producto (id, producto_id, producto_nombre, variante, stock, en_reparacion)
select 'magneto', 'magneto', 'Equipo de Magnetoterapia', 'Modelo unico',
       coalesce(sum(stock), 0), coalesce(sum(en_reparacion), 0)
from variantes_producto
where id like 'magneto-%'
on conflict (id) do nothing;

-- 2) Si ya habias creado equipos QR del Magneto, pasan a un codigo nuevo
--    (MAGNETO-001, MAGNETO-002...). Hay que volver a imprimir esas etiquetas.
update equipos_historial h
set equipo_id = 'MAGNETO-' || lpad(o.n::text, 3, '0')
from (
  select id, row_number() over (order by creado_en, id) as n
  from equipos where variante_id like 'magneto-%'
) o
where h.equipo_id = o.id;

update equipos e
set id = 'MAGNETO-' || lpad(o.n::text, 3, '0'),
    variante_id = 'magneto'
from (
  select id, row_number() over (order by creado_en, id) as n
  from equipos where variante_id like 'magneto-%'
) o
where e.id = o.id;

-- 3) Borra las tres variantes viejas (ya no tienen equipos asignados).
delete from variantes_producto where id like 'magneto-%';

-- Guarda en cada contacto el historial de alquileres de pedidos ya borrados.
alter table contactos add column if not exists historial jsonb not null default '[]'::jsonb;
-- Seguimiento de trabajos de plantillas (sena, saldo, fecha de entrega y estado).
create table if not exists trabajos_plantillas (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  nombre text,
  apellido text,
  dni text,
  telefono text,
  direccion text,
  descripcion text not null,
  total integer not null default 0,
  sena integer not null default 0,
  fecha_inicio date,
  entrega_desde date,
  entrega_hasta date,
  estado text not null default 'en_fabricacion'
    check (estado in ('en_fabricacion', 'lista', 'entregada', 'cancelada')),
  avisado_listo boolean not null default false,
  entregada_en timestamptz,
  notas text
);

alter table trabajos_plantillas enable row level security;

drop policy if exists "trabajos_plantillas_admin" on trabajos_plantillas;
create policy "trabajos_plantillas_admin"
  on trabajos_plantillas for all to authenticated
  using (true) with check (true);

-- ============ 9. PAGOS ONLINE (Mercado Pago) ============
-- Pagos online con Mercado Pago (tarjeta, dinero en cuenta, etc.).
alter table pedidos add column if not exists pago_online_estado text;   -- pendiente | aprobado | rechazado | devuelto | revisar_monto
alter table pedidos add column if not exists pago_online_id text;
alter table pedidos add column if not exists pago_online_monto numeric;
alter table pedidos add column if not exists pago_online_metodo text;
alter table pedidos add column if not exists pagado_en timestamptz;

-- Seguridad: quien crea un pedido desde la web (anónimo) no puede decir que ya está pagado.
-- Solo las funciones del servidor (Mercado Pago) pueden completar estos datos.
create or replace function limpiar_pago_en_pedido_nuevo() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), 'anon') <> 'service_role' then
    new.pago_online_estado := null;
    new.pago_online_id := null;
    new.pago_online_monto := null;
    new.pago_online_metodo := null;
    new.pagado_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limpiar_pago_pedido_nuevo on pedidos;
create trigger trg_limpiar_pago_pedido_nuevo
  before insert on pedidos
  for each row execute function limpiar_pago_en_pedido_nuevo();

-- ============ 10. TRANSFERENCIA / QR ============
-- Pago por transferencia / QR desde la web.
-- El cliente avisa que transfirió (con o sin foto del comprobante) y vos lo confirmás en el panel.
create or replace function avisar_transferencia(pedido_ids uuid[], url text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update pedidos
    set pago_online_estado = 'transferencia',
        pago_online_metodo = 'transferencia',
        comprobante_url = url,
        comprobante_subido_en = now()
    where id = any(pedido_ids)
      and creado_en > now() - interval '3 hours'
      and (pago_online_estado is null or pago_online_estado in ('pendiente', 'transferencia', 'rechazado'));
end;
$$;

grant execute on function avisar_transferencia(uuid[], text) to anon, authenticated;
