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
    using (true);

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
create or replace function subir_comprobante(pedido_id uuid, url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update pedidos
    set comprobante_url = url,
        comprobante_subido_en = now(),
        pago_pendiente_revision = true
    where id = pedido_id;
end;
$$;

grant execute on function subir_comprobante(uuid, text) to anon, authenticated;
