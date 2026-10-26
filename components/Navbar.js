"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, logout } from "@/lib/auth";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  // Re-read the user whenever login/logout happens
  useEffect(() => {
    const update = () => setUser(getUser());
    update();
    window.addEventListener("gcode-auth", update);
    return () => window.removeEventListener("gcode-auth", update);
  }, []);

  const link = (href, label) => (
    <Link href={href} className={pathname === href ? "active" : ""}>
      {label}
    </Link>
  );

  return (
    <nav className="navbar">
      <Link href="/" className="brand">
        G<span>Code</span>
      </Link>

      <div className="nav-links">
        {link("/", "Globe")}
        {link("/problems", "Problems")}
        {user?.role === "admin" && link("/admin", "Admin")}
      </div>

      <div className="nav-user">
        {user ? (
          <>
            <span>{user.username}</span>
            <span className="role-badge">{user.role}</span>
            <button
              className="btn-ghost"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}
