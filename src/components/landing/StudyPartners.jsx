import { STUDY_PARTNERS } from "./studyPartnerData";
import "./StudyPartners.css";

export default function StudyPartners({ className = "" }) {
  return <section className={`study-partners ${className}`}>
    <p id="edc-study-partners-heading">Explore popular tools and platforms across technology and learning</p>
    <div className="study-partners-logos" role="region" aria-label="Technology and learning platform logos">
      <div className="study-partners-track">
        {[false, true].map(isDuplicate => <div className="study-partners-group" key={isDuplicate ? "duplicate" : "original"} aria-hidden={isDuplicate}>
          {STUDY_PARTNERS.map(company => <div className="study-partner-logo" key={company.name} role="img" aria-label={isDuplicate ? undefined : company.name} data-tooltip={company.name} tabIndex={isDuplicate ? -1 : 0}>
            <img src={company.logo} alt="" />
          </div>)}
        </div>)}
      </div>
    </div>
  </section>;
}
