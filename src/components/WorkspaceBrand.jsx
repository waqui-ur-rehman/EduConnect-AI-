import { GraduationCap } from "lucide-react";
import "./WorkspaceBrand.css";

function WorkspaceBrand({
  as: BrandElement = "div",
  className = "",
  ...props
}) {
  return (
    <BrandElement className={`edc-workspace-brand ${className}`.trim()} {...props}>
      <div className="edc-workspace-brand-icon" aria-hidden="true">
        <GraduationCap size={23} />
      </div>
      <div className="edc-workspace-brand-copy">
        <strong>EduConnect <b>AI</b></strong>
      </div>
    </BrandElement>
  );
}

export default WorkspaceBrand;
