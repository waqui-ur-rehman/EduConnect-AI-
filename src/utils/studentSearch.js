const normalize = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function matchesCourseSearch(course, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = normalize([
    course.title, course.category, course.description, course.subject, course.subjects,
    course.specialization, course.tags, course.program, course.programs,
    course.instructor, course.instructorName, course.teacherEmail,
    course.instructorProfile?.name, course.instructorProfile?.expertise,
  ].flat(Infinity).filter(Boolean).join(" "));
  return words.every(word => text.includes(word));
}

