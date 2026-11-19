-- ============================================================
-- ESQUEMA — Gauss Ortopedia (backend propio, PostgreSQL)
-- Estado final equivalente a supabase-schema.sql + SQL 1 al 11.
-- Se puede correr muchas veces sin problema (npm run migrar).
-- ============================================================

-- --- Usuarios del panel de administración ---
create table if not exists admin_users (
    id uuid primary key default gen_random_uuid(),
    creado_en timestamptz not null default now(),
    email text not null unique,
    password_hash text not null,
    activo boolean not null default true
);

-- --- Pedidos (ventas y alquileres) ---
create table if not exists pedidos (
    id uuid primary key default gen_random_uuid(),
    creado_en timestamptz not null default now(),
    tipo text not null check (tipo in ('venta', 'alquiler')),
    producto_id text not null,
    producto_nombre text not null,
    cantidad integer not null default 1,
    precio_unitario integer not null,
    total integer not null,
    fecha_desde date,
    fecha_hasta date,
    nombre text,
    apellido text,
    telefono text,
    dni text,
    direccion text,
    lesion text,
    duracion_dias integer,
    comprobante_url text,
    comprobante_subido_en timestamptz,
    pago_pendiente_revision boolean not null default false,
    veces_renovado integer not null default 0,
    aviso_retiro_enviado boolean not null default false,
    recordatorio_vencimiento_enviado_en timestamptz,
    estado text not null default 'pendiente',
    renovacion_duracion_dias integer,
    renovacion_monto integer,
    pendiente_facturacion boolean not null default false,
    facturado_en timestamptz,
    pago_online_estado text,
    pago_online_id text,
    pago_online_monto numeric,
    pago_online_metodo text,
    pagado_en timestamptz
);

alter table pedidos drop constraint if exists pedidos_estado_check;
alter table pedidos add constraint pedidos_estado_check
    check (estado in ('pendiente', 'confirmado', 'activo', 'devuelto', 'cancelado', 'entregado'));

create index if not exists idx_pedidos_disponibilidad
    on pedidos (producto_id, tipo, estado, fecha_desde, fecha_hasta);
create index if not exists idx_pedidos_creado on pedidos (creado_en desc);

-- Vista pública de disponibilidad: sin datos personales.
create or replace view disponibilidad_publica as
    select id, tipo, producto_id, fecha_desde, fecha_hasta, estado
    from pedidos
    where tipo = 'alquiler';

-- --- Stock por variante ---
create table if not exists variantes_producto (
    id text primary key,
    producto_id text not null,
    producto_nombre text not null,
    variante text not null,
    stock integer not null default 0,
    en_reparacion integer not null default 0
);

insert into variantes_producto (id, producto_id, producto_nombre, variante, stock) values
    ('muletas-chica',        'muletas',     'Muletas de Aluminio Regulables (par)', 'Chica',   10),
    ('muletas-mediana',      'muletas',     'Muletas de Aluminio Regulables (par)', 'Mediana', 30),
    ('muletas-grande',       'muletas',     'Muletas de Aluminio Regulables (par)', 'Grande',  10),
    ('bota-walker-chica',    'bota-walker', 'Bota Walker Inmovilizadora',           'Chica',   15),
    ('bota-walker-mediana',  'bota-walker', 'Bota Walker Inmovilizadora',           'Mediana', 25),
    ('bota-walker-grande',   'bota-walker', 'Bota Walker Inmovilizadora',           'Grande',  10),
    ('magneto',              'magneto',     'Equipo de Magnetoterapia',             'Modelo unico', 500),
    ('silla-de-ruedas-unica','silla-de-ruedas','Silla de Ruedas',                   'Modelo unico', 0),
    ('andador-con-ruedas',   'andador',     'Andador',                              'Con ruedas', 0),
    ('andador-sin-ruedas',   'andador',     'Andador',                              'Sin ruedas', 0),
    ('roll-out-unica',       'roll-out',    'Roll Out',                             'Modelo unico', 0),
    ('eleva-inodoro-unica',  'eleva-inodoro','Eleva Inodoro',                       'Modelo unico', 0)
on conflict (id) do nothing;

-- --- Equipos con QR (una fila por unidad física) ---
create table if not exists equipos (
    id text primary key,
    variante_id text not null references variantes_producto(id),
    pedido_id uuid references pedidos(id) on delete set null,
    creado_en timestamptz not null default now(),
    en_reparacion boolean not null default false,
    reparacion_desde timestamptz,
    reparacion_nota text
);

create table if not exists equipos_historial (
    id uuid primary key default gen_random_uuid(),
    creado_en timestamptz not null default now(),
    equipo_id text not null,
    accion text not null,
    detalle text
);

-- --- Contactos (agenda que se conserva aunque se borren pedidos) ---
create table if not exists contactos (
    id uuid primary key default gen_random_uuid(),
    creado_en timestamptz not null default now(),
    nombre text,
    apellido text,
    dni text,
    telefono text,
    direccion text,
    notas text,
    historial jsonb not null default '[]'::jsonb
);

-- --- Trabajos de plantillas ---
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
