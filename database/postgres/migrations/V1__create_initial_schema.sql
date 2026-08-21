CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    auth_id UUID NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    rol VARCHAR(20) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_usuario_rol
        CHECK (rol IN ('ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR')),

    CONSTRAINT chk_usuario_estado
        CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);

CREATE TABLE tienda (
    id_tienda SERIAL PRIMARY KEY,
    id_emprendedor INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(500),
    direccion VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    horario VARCHAR(150),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tienda_emprendedor
        FOREIGN KEY (id_emprendedor)
        REFERENCES usuario(id_usuario),

    CONSTRAINT chk_tienda_estado
        CHECK (estado IN ('ACTIVA', 'INACTIVA'))
);

CREATE TABLE categoria (
    id_categoria SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT chk_categoria_estado
        CHECK (estado IN ('ACTIVA', 'INACTIVA'))
);

CREATE TABLE producto (
    id_producto SERIAL PRIMARY KEY,
    id_tienda INTEGER NOT NULL,
    id_categoria INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(500),
    precio NUMERIC(10,2) NOT NULL,
    cantidad_disponible INTEGER NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_publicacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_producto_tienda
        FOREIGN KEY (id_tienda)
        REFERENCES tienda(id_tienda),

    CONSTRAINT fk_producto_categoria
        FOREIGN KEY (id_categoria)
        REFERENCES categoria(id_categoria),

    CONSTRAINT chk_producto_precio
        CHECK (precio > 0),

    CONSTRAINT chk_producto_cantidad
        CHECK (cantidad_disponible >= 0),

    CONSTRAINT chk_producto_estado
        CHECK (estado IN ('ACTIVO', 'INACTIVO', 'AGOTADO'))
);

CREATE TABLE barrio (
    id_barrio SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    tarifa_envio NUMERIC(10,2) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT chk_barrio_tarifa
        CHECK (tarifa_envio >= 0),

    CONSTRAINT chk_barrio_estado
        CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);

CREATE TABLE pedido (
    id_pedido SERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL,
    id_tienda INTEGER NOT NULL,
    id_barrio INTEGER NOT NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    subtotal NUMERIC(10,2) NOT NULL,
    tarifa_envio NUMERIC(10,2) NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    direccion_entrega VARCHAR(255) NOT NULL,

    CONSTRAINT fk_pedido_cliente
        FOREIGN KEY (id_cliente)
        REFERENCES usuario(id_usuario),

    CONSTRAINT fk_pedido_tienda
        FOREIGN KEY (id_tienda)
        REFERENCES tienda(id_tienda),

    CONSTRAINT fk_pedido_barrio
        FOREIGN KEY (id_barrio)
        REFERENCES barrio(id_barrio),

    CONSTRAINT chk_pedido_estado
        CHECK (
            estado IN (
                'PENDIENTE',
                'CONFIRMADO',
                'PREPARANDO',
                'EN_CAMINO',
                'ENTREGADO',
                'CANCELADO'
            )
        ),

    CONSTRAINT chk_pedido_subtotal
        CHECK (subtotal >= 0),

    CONSTRAINT chk_pedido_tarifa
        CHECK (tarifa_envio >= 0),

    CONSTRAINT chk_pedido_total
        CHECK (total >= 0),

    CONSTRAINT chk_pedido_total_calculado
        CHECK (total = subtotal + tarifa_envio)
);

CREATE TABLE detalle_pedido (
    id_detalle SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL,
    id_producto INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario NUMERIC(10,2) NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL,

    CONSTRAINT fk_detalle_pedido
        FOREIGN KEY (id_pedido)
        REFERENCES pedido(id_pedido),

    CONSTRAINT fk_detalle_producto
        FOREIGN KEY (id_producto)
        REFERENCES producto(id_producto),

    CONSTRAINT uq_detalle_pedido_producto
        UNIQUE (id_pedido, id_producto),

    CONSTRAINT chk_detalle_cantidad
        CHECK (cantidad > 0),

    CONSTRAINT chk_detalle_precio
        CHECK (precio_unitario > 0),

    CONSTRAINT chk_detalle_subtotal
        CHECK (subtotal >= 0),

    CONSTRAINT chk_detalle_subtotal_calculado
        CHECK (subtotal = cantidad * precio_unitario)
);

CREATE TABLE repartidor (
    id_repartidor SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL UNIQUE,
    medio_transporte VARCHAR(50) NOT NULL,
    disponibilidad VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',

    CONSTRAINT fk_repartidor_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario),

    CONSTRAINT chk_repartidor_disponibilidad
        CHECK (
            disponibilidad IN (
                'DISPONIBLE',
                'OCUPADO',
                'INACTIVO'
            )
        )
);

CREATE TABLE entrega (
    id_entrega SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL,
    id_repartidor INTEGER NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ASIGNADA',
    fecha_asignacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_entrega TIMESTAMP,

    CONSTRAINT fk_entrega_pedido
        FOREIGN KEY (id_pedido)
        REFERENCES pedido(id_pedido),

    CONSTRAINT fk_entrega_repartidor
        FOREIGN KEY (id_repartidor)
        REFERENCES repartidor(id_repartidor),

    CONSTRAINT chk_entrega_estado
        CHECK (
            estado IN (
                'ASIGNADA',
                'EN_CAMINO',
                'ENTREGADA',
                'CANCELADA'
            )
        )
);

-- =========================================================
-- ÍNDICES
--=========================================================

-- Búsqueda de tiendas pertenecientes a un emprendedor
CREATE INDEX idx_tienda_emprendedor
ON tienda(id_emprendedor);

-- Búsqueda de productos pertenecientes a una tienda
CREATE INDEX idx_producto_tienda
ON producto(id_tienda);

-- Búsqueda de productos por categoría
CREATE INDEX idx_producto_categoria
ON producto(id_categoria);

-- Búsqueda de pedidos realizados por un cliente
CREATE INDEX idx_pedido_cliente
ON pedido(id_cliente);

-- Búsqueda de pedidos pertenecientes a una tienda
CREATE INDEX idx_pedido_tienda
ON pedido(id_tienda);

-- Búsqueda de pedidos según el barrio de entrega
CREATE INDEX idx_pedido_barrio
ON pedido(id_barrio);

-- Búsqueda de detalles asociados a un producto
CREATE INDEX idx_detalle_producto
ON detalle_pedido(id_producto);

-- Búsqueda de entregas asignadas a un repartidor
CREATE INDEX idx_entrega_repartidor
ON entrega(id_repartidor);