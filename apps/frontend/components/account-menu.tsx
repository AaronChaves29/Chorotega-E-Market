"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import { ROLE_LABELS, type CurrentUser } from "@/types/auth";

export default function AccountMenu({
  user,
  adminUrl,
}: {
  user: CurrentUser;
  adminUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const fullName = `${user.nombre.trim()} ${user.apellido.trim()}`.trim();

  useEffect(() => {
    if (!open) return;
    function pointer(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="account-trigger"
        aria-label={`Mi cuenta: ${fullName}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
        </svg>
        <span className="account-trigger-name" title={fullName}>
          {fullName}
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <div id={panelId} className="account-dropdown" hidden={!open}>
        <div className="account-identity">
          <strong>{fullName}</strong>
          <span>{user.correo}</span>
          <span className="account-role">{ROLE_LABELS[user.rol]}</span>
        </div>
        <nav aria-label="Mi cuenta" onClick={() => setOpen(false)}>
          {user.rol === "CLIENTE" ? (
            <>
              <Link href="/pedidos" prefetch={false}>
                Mis pedidos
              </Link>
              <Link href="/emprendedores" prefetch={false}>
                ¿Sos emprendedor?
              </Link>
            </>
          ) : (
            <Link href="/cuenta" prefetch={false}>
              Mi cuenta
            </Link>
          )}
          {user.rol === "ADMIN" && adminUrl ? (
            <a href={adminUrl}>Panel administrativo</a>
          ) : null}
        </nav>
        <LogoutButton />
      </div>
    </div>
  );
}
