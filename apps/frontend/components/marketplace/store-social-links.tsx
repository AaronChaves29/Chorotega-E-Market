import {
  storeSocialLinks,
  type StoreSocialContact,
  type SocialField,
} from "@/lib/store-social-contact";
import styles from "./store-detail.module.css";

function SocialIcon({ kind }: { kind: SocialField }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "instagramUrl" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" />
        </>
      ) : kind === "facebookUrl" ? (
        <path d="M14 21v-8h3l.5-4H14V7c0-1 .5-2 2-2h2V2h-3c-4 0-5 2.5-5 5v2H7v4h3v8" />
      ) : (
        <>
          <path d="M20.5 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20l1.1-4.8a8.5 8.5 0 1 1 16.4-3.7Z" />
          <path d="M8 7.5c-.6 1.2-.2 3.4 1.8 5.4s4.2 2.4 5.4 1.8l.8-1.6-2.5-1.2-.8 1c-1.3-.5-2.4-1.6-2.9-2.9l1-.8-1.2-2.5Z" />
        </>
      )}
    </svg>
  );
}

export default function StoreSocialLinks({
  store,
}: {
  store: StoreSocialContact;
}) {
  const links = storeSocialLinks(store);
  if (links.length === 0) return null;
  return (
    <section
      className={styles.socialLinks}
      aria-label="Redes sociales y contacto comercial"
    >
      <h2 className={styles.socialHeading}>Conectá con este emprendimiento</h2>
      <div className={styles.socialList}>
        {links.map(({ kind, label, href }) => (
          <a
            key={kind}
            className={styles.socialLink}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} (se abre en otra pestaña)`}
          >
            <SocialIcon kind={kind} />
            {label}
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </section>
  );
}
