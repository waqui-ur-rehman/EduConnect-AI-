import { isModerationVisible } from "./moderationVisibility";
import { getContentState } from "./contentApi";

export function getPublishedTeacherCourses() {
  return getContentState().courses.filter((course) => isModerationVisible("course", `${String(course.teacherEmail || "").toLowerCase()}::${course.id}`));
}

export function getCourseCatalogForDisplay() {
  const courses = getPublishedTeacherCourses();
  const courseKeys = new Set(courses.map((course) =>
    `${String(course.teacherEmail || course.instructorEmail || course.instructorName || course.instructor || "demo").trim().toLowerCase()}::${String(course.id)}`
  ));

  if (typeof window === "undefined") {
    return courses;
  }

  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("educonnect.student.") || !key.endsWith(".enrollments")) {
        continue;
      }

      try {
        const enrollments = JSON.parse(window.localStorage.getItem(key) || "[]");
        if (!Array.isArray(enrollments)) continue;

        enrollments.forEach((enrollment) => {
          if (!enrollment || enrollment.id === undefined || enrollment.id === null
            || typeof enrollment.title !== "string" || !enrollment.title.trim()) {
            return;
          }

          const teacherEmail = String(enrollment.teacherEmail || enrollment.instructorEmail || "").trim();
          const instructorName = String(enrollment.instructorName || enrollment.instructor || "EduConnect Instructor").trim();
          const courseKey = `${(teacherEmail || instructorName || "demo").toLowerCase()}::${String(enrollment.id)}`;
          if (courseKeys.has(courseKey)
            || !isModerationVisible("course", `${(teacherEmail || "demo").toLowerCase()}::${String(enrollment.id)}`)) {
            return;
          }

          const lessons = Array.isArray(enrollment.lessons)
            ? enrollment.lessons.length
            : Math.max(0, Number(enrollment.lessons) || 0);
          courses.push({
            id: enrollment.id,
            title: enrollment.title.trim(),
            teacherEmail,
            instructorName,
            category: enrollment.category || "General",
            level: enrollment.level || "",
            description: enrollment.description || "",
            price: Math.max(0, Number(enrollment.price) || 0),
            thumbnail: enrollment.thumbnail || enrollment.image || "",
            image: enrollment.image || enrollment.thumbnail || "",
            lessons,
            isEnrollmentSnapshot: true,
          });
          courseKeys.add(courseKey);
        });
      } catch (error) {
        console.error("Error reading student course history.", error);
      }
    }
  } catch (error) {
    console.error("Course history storage error.", error);
  }

  return courses;
}

// Keeps the earlier import compatible.
export const getApprovedTeacherCourses =
  getPublishedTeacherCourses;
