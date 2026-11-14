import Image from "next/image";
import Link from "next/link";
import styles from "./public-landing.module.css";

const assets = "/landing/";

function Icon({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <Image
      src={`${assets}${name}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

function Emblem({ footer = false }: { footer?: boolean }) {
  return (
    <span className={footer ? styles.footerEmblem : styles.emblem}>
      <Image
        src="/registration/chorotega-emblem.png"
        width={1024}
        height={1024}
        alt="Chorotega E-Market"
      />
    </span>
  );
}

const categories = [
  ["Comida", "Sabores de nuestra región", "utensils"],
  ["Artesanías", "Creaciones con identidad", "palette"],
  ["Servicios", "Talento de nuestra comunidad", "wrench"],
  ["Ropa", "Estilo hecho aquí", "shirt"],
  ["Hogar", "Detalles para tu espacio", "house"],
  ["Regalos", "Ideas para compartir", "gift"],
] as const;

const roles = [
  {
    title: "Cliente",
    icon: "shopping-bag",
    description:
      "Descubre productos auténticos, compra de forma sencilla y apoya a quienes emprenden cerca de ti.",
    href: "/registro/cliente",
  },
  {
    title: "Emprendedor",
    icon: "store",
    description:
      "Publica tus productos, organiza tus pedidos y conecta con clientes de tu comunidad.",
    href: "/registro/emprendedor",
  },
  {
    title: "Repartidor",
    icon: "truck",
    description:
      "Entrega productos en tu zona y conecta a los emprendimientos con sus clientes.",
    href: "/registro/repartidor",
  },
] as const;

const benefits = [
  {
    title: "Para emprendedores",
    items: [
      {
        icon: "store1",
        title: "Mayor visibilidad",
        text: "Acerca tus productos a clientes de tu comunidad.",
      },
      {
        icon: "package",
        title: "Ventas más fáciles",
        text: "Organiza tus productos y consulta los pedidos de tu negocio.",
      },
    ],
  },
  {
    title: "Para clientes",
    items: [
      {
        icon: "heart",
        title: "Compras locales",
        text: "Encuentra productos únicos y auténticos de tu propia comunidad.",
      },
      {
        icon: "shopping-bag1",
        title: "Entrega y seguimiento",
        text: "Recibe tus productos en casa y consulta el estado de tu pedido.",
      },
    ],
  },
  {
    title: "Para repartidores",
    items: [
      {
        icon: "truck1",
        title: "Ingresos flexibles",
        text: "Conecta los emprendimientos con sus clientes mediante entregas en tu zona.",
      },
      {
        icon: "users",
        title: "Comunidad unida",
        text: "Sé el vínculo entre quienes crean y quienes compran.",
      },
    ],
  },
] as const;

// Contenido editorial: esta vista no importa clientes API ni consulta el catálogo.
export default function PublicLanding() {
  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#contenido">
        Saltar al contenido
      </a>
      <header className={styles.header} data-figma-section="2023:51757">
        <Link
          href="/"
          className={styles.brand}
          aria-label="Chorotega E-Market, inicio"
        >
          <Emblem />
          <span>
            <strong>Chorotega</strong>
            <small>E-MARKET</small>
          </span>
        </Link>
        <nav className={styles.navigation} aria-label="Navegación principal">
          <a href="#mercado">El mercado</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#comunidad">Nuestra comunidad</a>
        </nav>
        <div className={styles.access}>
          <Link href="/login">Iniciar sesión</Link>
          <Link href="/registro" className={styles.primaryButton}>
            Únete a la comunidad
          </Link>
        </div>
      </header>

      <main id="contenido">
        <section
          id="mercado"
          className={styles.hero}
          aria-labelledby="landing-title"
          data-figma-section="2023:51771"
        >
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Nicoya, Guanacaste · Costa Rica</p>
            <h1 id="landing-title">Lo mejor de aquí, más cerca de ti.</h1>
            <p className={styles.heroDescription}>
              Descubre productos con historia. Conecta con emprendimientos de la
              región Chorotega y lleva un pedacito de nuestra comunidad a casa.
            </p>
            <div className={styles.actions}>
              <Link href="/login" className={styles.primaryButton}>
                <Icon name="continuar" size={18} />
                Entrar al mercado
              </Link>
              <Link href="/registro" className={styles.secondaryButton}>
                Quiero ser parte
              </Link>
            </div>
            <p className={styles.origin}>
              <Icon name="sprout" size={22} />
              Emprendimientos locales. Cultura viva. Comunidad conectada.
            </p>
          </div>
          <figure className={styles.heroFigure}>
            <Image
              className={styles.heroPhoto}
              src={`${assets}manos-artesanas.png`}
              width={1152}
              height={928}
              sizes="(max-width: 900px) 100vw, 610px"
              alt="Manos de un artesano decorando una pieza de cerámica"
              priority
            />
            <figcaption>
              <div>
                <h2>Manos que cuentan historias</h2>
                <p>Tradición y creatividad de nuestra tierra</p>
              </div>
              <Icon name="arrow-up-right" size={22} />
            </figcaption>
          </figure>
        </section>

        <section
          className={styles.purpose}
          aria-labelledby="purpose-title"
          data-figma-section="2023:51793"
        >
          <div>
            <p className={styles.eyebrow}>Más que una plataforma</p>
            <h2 id="purpose-title">Un mercado que nace de su gente.</h2>
          </div>
          <p>
            Chorotega E-Market conecta emprendedores locales, clientes y
            repartidores. Promovemos la cultura de Nicoya, fortalecemos la
            economía local y facilitamos comprar y recibir productos en casa.
          </p>
        </section>

        <section
          id="categorias"
          className={styles.categories}
          aria-labelledby="categories-title"
          data-figma-section="2023:51798"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>El mercado de nuestra región</p>
              <h2 id="categories-title">Encuentra algo muy nuestro.</h2>
            </div>
            <p>
              Sabores, oficios y creaciones locales para cada momento de tu día.
            </p>
          </div>
          <div className={styles.categoryLayout}>
            <figure className={styles.craftsFigure}>
              <Image
                src="/registration/local-crafts.png"
                width={1600}
                height={1062}
                sizes="(max-width: 900px) 100vw, 420px"
                alt="Colección de cerámicas artesanales con motivos tradicionales"
              />
              <figcaption>
                <h3>Tradición para llevar a casa</h3>
                <Link href="/login">
                  Explora las artesanías de nuestra comunidad →
                </Link>
              </figcaption>
            </figure>
            <div className={styles.categoryGrid}>
              {categories.map(([name, description, icon]) => (
                <article key={name} className={styles.categoryCard}>
                  <span className={styles.categoryIcon}>
                    <Icon name={icon} />
                  </span>
                  <div>
                    <h3>{name}</h3>
                    <p>{description}</p>
                  </div>
                  <Icon name="arrow-up-right1" size={18} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="comunidad"
          className={styles.community}
          aria-labelledby="community-title"
          data-figma-section="2023:51856"
        >
          <p className={styles.eyebrow}>Cómo funciona</p>
          <h2 id="community-title">Una comunidad. Tres formas de conectar.</h2>
          <div className={styles.roleGrid}>
            {roles.map((role) => (
              <article key={role.title} className={styles.roleCard}>
                <Icon name={role.icon} size={32} />
                <h3>{role.title}</h3>
                <p>{role.description}</p>
                <Link href={role.href} className={styles.secondaryButton}>
                  Registrarme como {role.title.toLowerCase()}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section
          className={styles.benefits}
          aria-labelledby="benefits-title"
          data-figma-section="2023:51878"
        >
          <p className={styles.eyebrow}>Por qué ser parte</p>
          <h2 id="benefits-title">Lo que ganamos al conectar.</h2>
          <div className={styles.benefitGrid}>
            {benefits.map((group) => (
              <div key={group.title} className={styles.benefitGroup}>
                <h3>{group.title}</h3>
                {group.items.map((item) => (
                  <article key={item.title} className={styles.benefitItem}>
                    <Icon name={item.icon} />
                    <div>
                      <h4>{item.title}</h4>
                      <p>{item.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section
          className={styles.ourLand}
          aria-labelledby="land-title"
          data-figma-section="2023:51918"
        >
          <div className={styles.nicoyaPhoto}>
            <Image
              src={`${assets}nicoya-original.png`}
              width={2000}
              height={1333}
              sizes="(max-width: 900px) 100vw, 664px"
              alt="Iglesia colonial y paisaje urbano de Nicoya, Guanacaste"
            />
          </div>
          <div>
            <p className={styles.eyebrow}>De Nicoya para nuestra gente</p>
            <h2 id="land-title">
              La tradición también encuentra nuevos caminos.
            </h2>
            <p>
              Detrás de cada producto hay una historia, un oficio y una persona.
              Este mercado reúne la creatividad local con nuevas formas de
              comprar, vender y encontrarnos.
            </p>
            <Link href="/login" className={styles.secondaryButton}>
              <Icon name="continuar1" size={18} />
              Conoce el mercado
            </Link>
          </div>
        </section>

        <section
          id="como-funciona"
          className={styles.howItWorks}
          aria-labelledby="steps-title"
          data-figma-section="2023:51928"
        >
          <div className={styles.sectionHeading}>
            <h2 id="steps-title">Comprar local, paso a paso.</h2>
            <p className={styles.eyebrow}>Todo desde un mismo lugar</p>
          </div>
          <ol className={styles.steps}>
            {[
              ["Descubre", "Busca emprendimientos y explora sus productos."],
              [
                "Elige",
                "Selecciona los productos de una tienda y completa la dirección de entrega.",
              ],
              ["Conecta", "Confirma tu pedido y consulta su estado."],
            ].map(([title, text], index) => (
              <li key={title}>
                <span aria-hidden="true">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={styles.invitation}
          aria-labelledby="invitation-title"
          data-figma-section="2023:51945"
        >
          <div>
            <p className={styles.eyebrow}>El siguiente paso es tuyo</p>
            <h2 id="invitation-title">
              Lo nuestro crece cuando estamos conectados.
            </h2>
          </div>
          <div className={styles.invitationActions}>
            <Link href="/registro" className={styles.secondaryButton}>
              Crear mi cuenta
            </Link>
            <Link href="/login">Explorar el mercado →</Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerNavigation}>
            <div className={styles.footerIdentity}>
              <Emblem footer />
              <p>
                El mercado digital que conecta a la región Chorotega. Nicoya,
                Costa Rica.
              </p>
            </div>
            <nav aria-label="Mercado">
              <h2>Mercado</h2>
              <Link href="/login">Explorar emprendimientos</Link>
              <a href="#categorias">Categorías</a>
              <a href="#categorias">Artesanías Chorotega</a>
            </nav>
            <nav aria-label="Comunidad">
              <h2>Comunidad</h2>
              <Link href="/registro/cliente">Ser cliente</Link>
              <Link href="/registro/emprendedor">Ser emprendedor</Link>
              <Link href="/registro/repartidor">Ser repartidor</Link>
            </nav>
            <nav aria-label="Tu cuenta">
              <h2>Tu cuenta</h2>
              <Link href="/login">Iniciar sesión</Link>
              <Link href="/registro">Registrarse</Link>
              <a href="#como-funciona">Ayuda</a>
            </nav>
          </div>
          <div className={styles.footerBottom}>
            <p>Chorotega E-Market · Nuestra comunidad, más cerca.</p>
            <p>
              Instagram <span aria-hidden="true"> / </span> Facebook{" "}
              <span aria-hidden="true"> / </span> WhatsApp
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
