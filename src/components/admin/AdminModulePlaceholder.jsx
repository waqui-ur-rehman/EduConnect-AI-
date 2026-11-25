import { Construction } from "lucide-react";

function AdminModulePlaceholder({ title, description }) {
  return (
    <section className="edc-admin-module-placeholder">
      <span className="edc-admin-placeholder-icon" aria-hidden="true">
        <Construction size={24} />
      </span>
      <h3>{title} is coming in a later phase</h3>
      <p>{description}</p>
      <span className="edc-admin-coming-soon">Module not implemented yet</span>
    </section>
  );
}

export default AdminModulePlaceholder;
