"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveUser } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
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
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      saveUser(data);
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
          <label htmlFor="username">Username</label>
          <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} />

          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="notice" style={{ marginTop: 16 }}>
          Dev mode: any password works, and the username &quot;admin&quot; gets the admin role.
        </p>
      </div>
    </main>
  );
}
