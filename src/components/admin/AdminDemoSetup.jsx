
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setupDemoAdmin } from "./createDemoAdmin";

export default function DemoAdminSetup() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  if (!import.meta.env.DEV) {
    return <p>Page not available.</p>;
  }

  function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      setupDemoAdmin(email, password);
      navigate("/login", {
        replace: true,
        state: { registeredEmail: email.trim().toLowerCase() },
      });
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main
      style={{
        maxWidth: 420,
        margin: "80px auto",
        padding: 24,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Demo Admin Setup</h1>
      <p>For local frontend testing only.</p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="admin-email">Admin Email</label>
        <input
          id="admin-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={{
            display: "block",
            width: "100%",
            padding: 12,
            margin: "8px 0 18px",
            boxSizing: "border-box",
          }}
        />

        <label htmlFor="admin-password">Admin Password</label>
        <input
          id="admin-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{
            display: "block",
            width: "100%",
            padding: 12,
            margin: "8px 0 18px",
            boxSizing: "border-box",
          }}
        />

        {message && (
          <p role="alert" style={{ color: "crimson" }}>
            {message}
          </p>
        )}

        <button
          type="submit"
          style={{
            padding: "12px 24px",
            background: "#6d28d9",
            color: "white",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Create Demo Admin
        </button>
      </form>
    </main>
  );
}
