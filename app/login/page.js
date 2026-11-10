"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notifyAuthChange } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      notifyAuthChange();
      router.push(data.role === "admin" ? "/admin" : "/");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="login-box card">
        <h1>Log in</h1>
        <p className="subtitle">Admins can sync data from Codeforces. Viewers can explore.</p>

        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
