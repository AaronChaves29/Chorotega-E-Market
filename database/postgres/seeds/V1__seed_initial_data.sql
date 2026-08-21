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
    'CONFIRMADO',
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
  AND p.estado = 'CONFIRMADO';

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
  AND p.estado = 'CONFIRMADO';


UPDATE producto
SET cantidad_disponible = cantidad_disponible - 2
WHERE nombre = 'Cafe Chorotega';

UPDATE producto
SET cantidad_disponible = cantidad_disponible - 1
WHERE nombre = 'Artesania de madera';

INSERT INTO entrega (
    id_pedido,
    id_repartidor,
    estado
)
SELECT
    p.id_pedido,
    r.id_repartidor,
    'ASIGNADA'
FROM pedido p
JOIN usuario cliente
    ON p.id_cliente = cliente.id_usuario
CROSS JOIN repartidor r
JOIN usuario repartidor_usuario
    ON r.id_usuario = repartidor_usuario.id_usuario
WHERE cliente.correo = 'aaron@example.com'
  AND repartidor_usuario.correo = 'carlos@example.com'
  AND p.estado = 'CONFIRMADO';

  