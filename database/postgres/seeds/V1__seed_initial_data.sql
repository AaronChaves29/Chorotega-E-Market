INSERT INTO usuario (
    auth_id,
    nombre,
    apellido,
    correo,
    telefono,
    rol,
    estado
) VALUES
(
    '11111111-1111-1111-1111-111111111111',
    'Sofia',
    'Jimenez',
    'sofia@example.com',
    '8888-1111',
    'EMPRENDEDOR',
    'ACTIVO'
),
(
    '22222222-2222-2222-2222-222222222222',
    'Aaron',
    'Chaves',
    'aaron@example.com',
    '8888-2222',
    'CLIENTE',
    'ACTIVO'
),
(
    '33333333-3333-3333-3333-333333333333',
    'Carlos',
    'Mora',
    'carlos@example.com',
    '8888-3333',
    'REPARTIDOR',
    'ACTIVO'
);

INSERT INTO tienda (
    id_emprendedor,
    nombre,
    descripcion,
    direccion,
    telefono,
    horario,
    estado
) VALUES
(
    1,
    'Sabores de Nicoya',
    'Tienda de productos locales de Nicoya',
    'Nicoya centro',
    '8888-4444',
    'Lunes a sábado de 8:00 a 17:00',
    'ACTIVA'
);

INSERT INTO categoria (
    nombre,
    descripcion,
    estado
) VALUES
(
    'Alimentos',
    'Productos alimenticios elaborados por emprendedores locales',
    'ACTIVA'
),
(
    'Artesanias',
    'Productos artesanales elaborados en la zona',
    'ACTIVA'
);

INSERT INTO barrio (
    nombre,
    tarifa_envio,
    estado
) VALUES
(
    'Nicoya Centro',
    1500.00,
    'ACTIVO'
),
(
    'San Martin',
    1800.00,
    'ACTIVO'
);

INSERT INTO producto (
    id_tienda,
    id_categoria,
    nombre,
    descripcion,
    precio,
    cantidad_disponible,
    estado
) VALUES
(
    1,
    1,
    'Cafe Chorotega',
    'Cafe producido por emprendimiento local',
    4500.00,
    20,
    'ACTIVO'
),
(
    1,
    2,
    'Artesania de madera',
    'Artesania elaborada a mano',
    8000.00,
    10,
    'ACTIVO'
);

INSERT INTO repartidor (
    id_usuario,
    medio_transporte,
    disponibilidad
)
SELECT
    id_usuario,
    'Motocicleta',
    'OCUPADO'
FROM usuario
WHERE correo = 'carlos@example.com';

INSERT INTO pedido (
    id_cliente,
    id_tienda,
    id_barrio,
    fecha_creacion,
    estado,
    subtotal,
    tarifa_envio,
    total,
    direccion_entrega
)
SELECT
    u.id_usuario,
    t.id_tienda,
    b.id_barrio,
    TIMESTAMP '2026-08-21 14:00:00',
    'EN_CAMINO',
    17000.00,
    1500.00,
    18500.00,
    '100 metros norte del parque de Nicoya'
FROM usuario u
JOIN tienda t
    ON t.nombre = 'Sabores de Nicoya'
JOIN barrio b
    ON b.nombre = 'Nicoya Centro'
WHERE u.correo = 'aaron@example.com';

-- Pedidos adicionales para representar diferentes ciclos de vida
INSERT INTO pedido (
    id_cliente,
    id_tienda,
    id_barrio,
    fecha_creacion,
    estado,
    subtotal,
    tarifa_envio,
    total,
    direccion_entrega
)
SELECT
    u.id_usuario,
    t.id_tienda,
    b.id_barrio,
    datos.fecha_creacion,
    datos.estado,
    datos.subtotal,
    datos.tarifa_envio,
    datos.total,
    datos.direccion_entrega
FROM usuario u
JOIN tienda t
    ON t.nombre = 'Sabores de Nicoya'
JOIN (
    VALUES
        (
            'Nicoya Centro',
            TIMESTAMP '2026-08-22 09:00:00',
            'CANCELADO',
            4500.00::NUMERIC,
            1500.00::NUMERIC,
            6000.00::NUMERIC,
            'Frente a la iglesia colonial de Nicoya'
        ),
        (
            'San Martin',
            TIMESTAMP '2026-08-23 10:00:00',
            'PREPARANDO',
            4500.00::NUMERIC,
            1800.00::NUMERIC,
            6300.00::NUMERIC,
            'Contiguo a la plaza de deportes de San Martin'
        ),
        (
            'Nicoya Centro',
            TIMESTAMP '2026-08-24 11:00:00',
            'ENTREGADO',
            8000.00::NUMERIC,
            1500.00::NUMERIC,
            9500.00::NUMERIC,
            'Costado oeste del mercado municipal de Nicoya'
        )
) AS datos (
    barrio_nombre,
    fecha_creacion,
    estado,
    subtotal,
    tarifa_envio,
    total,
    direccion_entrega
)
    ON TRUE
JOIN barrio b
    ON b.nombre = datos.barrio_nombre
WHERE u.correo = 'aaron@example.com'
  AND NOT EXISTS (
      SELECT 1
      FROM pedido p
      WHERE p.direccion_entrega = datos.direccion_entrega
  )
  ORDER BY datos.fecha_creacion;

INSERT INTO detalle_pedido (
    id_pedido,
    id_producto,
    cantidad,
    precio_unitario,
    subtotal
)
SELECT
    p.id_pedido,
    pr.id_producto,
    2,
    4500.00,
    9000.00
FROM pedido p
JOIN usuario u
    ON p.id_cliente = u.id_usuario
JOIN producto pr
    ON pr.nombre = 'Cafe Chorotega'
WHERE u.correo = 'aaron@example.com'
  AND p.direccion_entrega =
      '100 metros norte del parque de Nicoya';

INSERT INTO detalle_pedido (
    id_pedido,
    id_producto,
    cantidad,
    precio_unitario,
    subtotal
)
SELECT
    p.id_pedido,
    pr.id_producto,
    1,
    8000.00,
    8000.00
FROM pedido p
JOIN usuario u
    ON p.id_cliente = u.id_usuario
JOIN producto pr
    ON pr.nombre = 'Artesania de madera'
WHERE u.correo = 'aaron@example.com'
  AND p.direccion_entrega =
      '100 metros norte del parque de Nicoya';

-- Detalles correspondientes a los pedidos adicionales
INSERT INTO detalle_pedido (
    id_pedido,
    id_producto,
    cantidad,
    precio_unitario,
    subtotal
)
SELECT
    p.id_pedido,
    pr.id_producto,
    datos.cantidad,
    datos.precio_unitario,
    datos.subtotal
FROM (
    VALUES
        (
            'Frente a la iglesia colonial de Nicoya',
            'Cafe Chorotega',
            1,
            4500.00::NUMERIC,
            4500.00::NUMERIC
        ),
        (
            'Contiguo a la plaza de deportes de San Martin',
            'Cafe Chorotega',
            1,
            4500.00::NUMERIC,
            4500.00::NUMERIC
        ),
        (
            'Costado oeste del mercado municipal de Nicoya',
            'Artesania de madera',
            1,
            8000.00::NUMERIC,
            8000.00::NUMERIC
        )
) AS datos (
    direccion_entrega,
    producto_nombre,
    cantidad,
    precio_unitario,
    subtotal
)
JOIN pedido p
    ON p.direccion_entrega = datos.direccion_entrega
JOIN producto pr
    ON pr.nombre = datos.producto_nombre
WHERE NOT EXISTS (
    SELECT 1
    FROM detalle_pedido dp
    WHERE dp.id_pedido = p.id_pedido
      AND dp.id_producto = pr.id_producto
);

UPDATE producto
SET cantidad_disponible = cantidad_disponible - 3
WHERE nombre = 'Cafe Chorotega';

UPDATE producto
SET cantidad_disponible = cantidad_disponible - 2
WHERE nombre = 'Artesania de madera';

INSERT INTO entrega (
    id_pedido,
    id_repartidor,
    estado,
    fecha_asignacion
)
SELECT
    p.id_pedido,
    r.id_repartidor,
    'EN_CAMINO',
    TIMESTAMP '2026-08-21 15:00:00'
FROM pedido p
JOIN usuario cliente
    ON p.id_cliente = cliente.id_usuario
CROSS JOIN repartidor r
JOIN usuario repartidor_usuario
    ON r.id_usuario = repartidor_usuario.id_usuario
WHERE cliente.correo = 'aaron@example.com'
  AND repartidor_usuario.correo = 'carlos@example.com'
  AND p.direccion_entrega =
      '100 metros norte del parque de Nicoya';

-- Entrega completada correspondiente al pedido entregado
INSERT INTO entrega (
    id_pedido,
    id_repartidor,
    estado,
    fecha_asignacion,
    fecha_entrega
)
SELECT
    p.id_pedido,
    r.id_repartidor,
    'ENTREGADA',
    TIMESTAMP '2026-08-24 11:30:00',
    TIMESTAMP '2026-08-24 13:00:00'
FROM pedido p
CROSS JOIN repartidor r
JOIN usuario repartidor_usuario
    ON r.id_usuario = repartidor_usuario.id_usuario
WHERE p.direccion_entrega =
      'Costado oeste del mercado municipal de Nicoya'
  AND repartidor_usuario.correo = 'carlos@example.com'
  AND NOT EXISTS (
      SELECT 1
      FROM entrega e
      WHERE e.id_pedido = p.id_pedido
  );
