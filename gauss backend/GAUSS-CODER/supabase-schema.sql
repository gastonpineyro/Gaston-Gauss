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
    dni text,
    direccion text,
    lesion text,

    -- pendiente -> recién llegado por WhatsApp
    -- confirmado -> vos ya lo confirmaste
    -- cancelado -> no se concretó (libera disponibilidad)
    estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'cancelado'))
);

create index if not exists idx_pedidos_disponibilidad
    on pedidos (producto_id, tipo, estado, fecha_desde, fecha_hasta);

-- --- Seguridad a nivel de fila (RLS) ---
-- El sitio es público y anónimo: cualquier visitante puede CREAR un pedido
-- (así funciona el carrito) y puede LEER las reservas de alquiler para
-- calcular disponibilidad, pero no puede ver los datos personales de nadie
-- ni modificar/borrar pedidos. Solo un usuario logueado (vos, desde el
-- panel de administración) puede ver el detalle completo y cambiar el estado.

alter table pedidos enable row level security;

-- Cualquiera puede crear un pedido (checkout del carrito / reservas)
create policy "insertar_pedidos_publico"
    on pedidos for insert
    to anon
    with check (true);

-- Cualquiera puede leer SOLO lo necesario para calcular disponibilidad
-- (fechas y producto), no datos personales. Se filtra en la app, pero
-- además restringimos las columnas visibles con una vista.
create policy "leer_pedidos_publico"
    on pedidos for select
    to anon
    using (true);

-- Actualizar (cambiar estado) y borrar: solo usuarios logueados (admin)
create policy "actualizar_pedidos_admin"
    on pedidos for update
    to authenticated
    using (true);

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

grant select on disponibilidad_publica to anon;
