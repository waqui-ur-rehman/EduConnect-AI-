import StudentLearningPaths from "./StudentLearningPaths";

export default function LearningPaths({ email, ...props }) {
  return <StudentLearningPaths key={email} email={email} {...props} />;
}
