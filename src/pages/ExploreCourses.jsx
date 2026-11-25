
import PublishedCourses from "../components/Marketplace/PublishedCourses";

import React, { useEffect, useMemo, useState } from "react";
import ResilientImage from "../components/ResilientImage";
import ClassBooksArtwork from "../components/ClassBooksArtwork";
import {
  getProgramGroupsForDegreeLevel,
  getStudentAcademicSubjects,
  INTERMEDIATE_STREAMS,
  ONLINE_COURSES,
  normalizeRecommendationText,
} from "../utils/studentRecommendations";
import "./ExploreCourses.css";
import { coursePrograms as allCourses, imageSchool } from "../utils/courseCatalog";

const headerThemes = [
  ["#3b0764", "#7c3aed"],
  ["#123a70", "#3978df"],
  ["#07545c", "#11a3a0"],
  ["#713b16", "#e58a2c"],
  ["#6b214f", "#c64f91"],
  ["#254b37", "#55a875"],
  ["#3c3478", "#8170ed"],
  ["#71352c", "#d66c4e"],
  ["#164c66", "#38a0c2"],
  ["#4c3b19", "#c19a3c"],
  ["#3f356e", "#9670dc"],
  ["#394b67", "#668bb9"]
];
const categoryHeaderThemes = {
  Technology: ["#123a70", "#3978df"],
  Design: ["#6b214f", "#c64f91"],
  Business: ["#713b16", "#e58a2c"],
  Science: ["#07545c", "#11a3a0"],
  "Health Sciences": ["#254b37", "#55a875"],
  Engineering: ["#164c66", "#38a0c2"],
  Humanities: ["#3f356e", "#9670dc"],
  Research: ["#394b67", "#668bb9"],
  College: ["#3c3478", "#8170ed"],
  Undergraduate: ["#123a70", "#3978df"],
  Postgraduate: ["#713b16", "#e58a2c"],
  Doctoral: ["#254b37", "#55a875"]
};

const allSubjects = [
  ...new Set(allCourses.flatMap((course) => course.subjects))
].sort();

const schoolLevels = ["Primary", "Middle", "Secondary", "Higher Secondary"];
const educationLevelGroups = {
  School: schoolLevels,
  College: ["College"],
  University: ["Undergraduate", "Postgraduate", "MPhil", "PhD"],
  "Online Courses": ["Professional"]
};

const matchesEducationLevel = (courseLevel, selectedLevel) =>
  selectedLevel === "All" ||
  (educationLevelGroups[selectedLevel] || [selectedLevel]).includes(courseLevel);

const matchesCourseEducationLevel = (course, selectedLevel) => {
  if (selectedLevel === "School") {
    const number = Number(course.category.match(/^Class (\d+)$/)?.[1]);
    return number >= 1 && number <= 10;
  }
  return matchesEducationLevel(course.level, selectedLevel);
};

function matchesAcademicDetails(course, profile, profileSubjects) {
  if (profile.educationLevel === "school" && profile.classNumber) {
    return course.category === `Class ${profile.classNumber}`;
  }

  if (profile.educationLevel === "intermediate") {
    const courseYear = Number(course.intermediateYear || course.year || 0);
    if (courseYear && profile.intermediateYear && courseYear !== Number(profile.intermediateYear)) return false;
    const courseTitlesByStream = {
      PreMedical: "FSc Pre-Medical",
      PreEngineering: "FSc Pre-Engineering",
      ICS: "ICS",
      Commerce: "ICom",
      Arts: "FA and Arts",
    };
    const streamTitle = courseTitlesByStream[profile.stream];
    return !streamTitle || normalizeRecommendationText(course.title).includes(normalizeRecommendationText(streamTitle));
  }

  if (profile.educationLevel === "university") {
    const degreeLevels = {
      bs: ["Undergraduate"],
      masters: ["Postgraduate", "MPhil"],
      phd: ["PhD"],
    };
    if (profile.degreeLevel && !degreeLevels[profile.degreeLevel]?.includes(course.level)) return false;
  }

  if (["university", "online"].includes(profile.educationLevel) && profile.program) {
    const program = normalizeRecommendationText(profile.program);
    const courseTitle = normalizeRecommendationText(course.title);
    const titleMatches = courseTitle.includes(program) || program.includes(courseTitle);
    const selectedSubjects = new Set(profileSubjects.map(normalizeRecommendationText));
    const subjectMatches = course.subjects.some((item) => selectedSubjects.has(normalizeRecommendationText(item)));
    return titleMatches || subjectMatches;
  }

  return true;
}

function ExploreCourses({
  initialSearch = "",
  initialCategory = "All",
  initialProgramId = ""
}) {
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [level, setLevel] = useState("All");
  const [academicDetails, setAcademicDetails] = useState({
    classNumber: "",
    intermediateYear: "",
    stream: "PreEngineering",
    degreeLevel: "",
    programChoice: "",
    customProgram: "",
  });
  const [selectedCourse, setSelectedCourse] = useState(() => allCourses.find(course => course.id === initialProgramId) || null);
  const [page, setPage] = useState(1);

  // Resets dependent filters and pagination when the URL-selected filters change.
  useEffect(() => {
    setSearch(initialSearch);
    setCategory(initialCategory);
    setLevel("All");
    setAcademicDetails({
      classNumber: "",
      intermediateYear: "",
      stream: "PreEngineering",
      degreeLevel: "",
      programChoice: "",
      customProgram: "",
    });
    setPage(1);
    setSelectedCourse(allCourses.find(course => course.id === initialProgramId) || null);
  }, [initialSearch, initialCategory, initialProgramId]);

  const selectedProgram = academicDetails.programChoice === "Other"
    ? academicDetails.customProgram.trim()
    : academicDetails.programChoice;
  const studentAcademicProfile = {
    educationLevel: {
      School: "school",
      College: "intermediate",
      University: "university",
      "Online Courses": "online",
    }[level] || "",
    classNumber: academicDetails.classNumber,
    intermediateYear: academicDetails.intermediateYear,
    stream: academicDetails.stream,
    degreeLevel: academicDetails.degreeLevel,
    programChoice: academicDetails.programChoice,
    program: selectedProgram,
  };
  const profileSubjects = getStudentAcademicSubjects(studentAcademicProfile);
  const pageTitle =
    search.trim() || (category !== "All" ? category : "Explore Courses and Subjects");
  const isSpecificPage = search.trim() !== "" || category !== "All";

  const filteredCourses = useMemo(() => {
    return allCourses
      .filter((course) => {
        const searchable = [
          course.title,
          course.category,
          course.level,
          course.description,
          ...course.subjects
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(search.toLowerCase().trim());
      })
      .filter((course) => category === "All" || course.category === category)
      .filter((course) => matchesCourseEducationLevel(course, level))
      .filter((course) => matchesAcademicDetails(course, studentAcademicProfile, profileSubjects))
      .sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
  }, [search, category, level, academicDetails, selectedProgram, profileSubjects]);

  const coursesPerPage = 9;
  const totalPages = Math.ceil(filteredCourses.length / coursesPerPage);
  const safePage = Math.min(page, Math.max(totalPages, 1));

  const visibleCourses = filteredCourses.slice(
    (safePage - 1) * coursesPerPage,
    safePage * coursesPerPage
  );
  const headerCourse = filteredCourses[0] || allCourses.find((course) => course.category === category);
  const headerImage = headerCourse?.image || imageSchool;
  const headerImageAlt = headerCourse?.title || "Students learning";
  const selectedClassNumber = Number(category.match(/^Class (\d+)$/)?.[1]);
  const matchingClassNumber = Number(
    headerCourse?.category.match(/^Class (\d+)$/)?.[1]
  );
  const classNumber =
    selectedClassNumber ||
    (search.trim() && matchingClassNumber ? matchingClassNumber : null);
  const headerTheme = classNumber
    ? headerThemes[(classNumber - 1) % headerThemes.length]
    : categoryHeaderThemes[headerCourse?.category] || ["#3b0764", "#7c3aed"];

  const resetFilters = () => {
    setSearch("");
    setCategory("All");
    setLevel("All");
    setAcademicDetails({
      classNumber: "",
      intermediateYear: "",
      stream: "PreEngineering",
      degreeLevel: "",
      programChoice: "",
      customProgram: "",
    });
    setPage(1);
  };

  const handleLevelChange = (value) => {
    setLevel(value);
    setAcademicDetails({
      classNumber: "",
      intermediateYear: "",
      stream: "PreEngineering",
      degreeLevel: "",
      programChoice: "",
      customProgram: "",
    });
    setPage(1);
    if (
      value !== "All" &&
      category !== "All" &&
      !allCourses.some(
        (course) => course.category === category && matchesCourseEducationLevel(course, value)
      )
    ) {
      setCategory("All");
    }
  };

  const selectCourse = (course) => {
    setSelectedCourse(course);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (selectedCourse) {
    return (
      <div className="explore-page">
        <div className="explore-detail-top">
          <button
            className="back-button"
            onClick={() => setSelectedCourse(null)}
          >
            ← Back to Courses
          </button>
        </div>

        <section className="course-detail-page">
          <ResilientImage
            className="course-detail-image"
            src={selectedCourse.image}
            alt={selectedCourse.title}
          />

          <div className="course-detail-info">
            <span className="course-category">
              {selectedCourse.category}
            </span>

            <h1>{selectedCourse.title}</h1>
            <p>{selectedCourse.description}</p>

            <div className="detail-meta">
              <span>📚 {selectedCourse.subjects.length} Subjects</span>
              <span>🎓 {selectedCourse.level}</span>
              <span>🆓 Learning Resources</span>
            </div>

            <h2>Subjects and Specializations</h2>

            <div className="subject-list">
              {selectedCourse.subjects.map((item) => (
                <span className="subject-chip" key={item}>
                  {item}
                </span>
              ))}
            </div>

            <PublishedCourses
              title="Related Teacher Courses"
              description={`Teacher courses related to ${selectedCourse.title} will appear here after publishing.`}
              relatedTo={[selectedCourse.title]}
            />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="explore-page">
      <section className="explore-header">
        {classNumber ? (
          <ClassBooksArtwork
            key={headerCourse?.id}
            className="explore-header-image class-books-artwork"
            classNumber={classNumber}
          />
        ) : (
          <ResilientImage
            key={headerCourse?.id || headerImage}
            className="explore-header-image"
            src={headerImage}
            alt={headerImageAlt}
          />
        )}
        <div
          key={headerCourse?.id || headerCourse?.category || "default"}
          className={`explore-header-image-overlay${classNumber ? " class-books-overlay" : ""}`}
          style={{
            "--header-color-start": headerTheme[0],
            "--header-color-end": headerTheme[1]
          }}
          aria-hidden="true"
        />
        <span className="explore-tag">
          {isSpecificPage ? "SUBJECT LEARNING PAGE" : "GLOBAL LEARNING LIBRARY"}
        </span>

        <h1 className="explore-header-title">
          {pageTitle}
        </h1>

        <p key={headerCourse?.id || pageTitle} className="explore-header-description">
          {search.trim()
            ? `Explore courses, subjects and learning resources for ${search.trim()}.`
            : category !== "All"
              ? `Explore courses and learning resources for ${category}.`
              : "From school education to university degrees, research and professional skills."}
        </p>

        <div className="explore-search">
          <input
            type="text"
            placeholder="Search course, subject, degree or skill..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <span>⌕</span>
        </div>

        <div className="explore-library-count">
          {allCourses.length} course programs · {allSubjects.length} subject areas
        </div>
      </section>

      <section className="explore-content">
        <aside className="course-filters">
          <div className="filter-heading">
            <h2>Filters</h2>
            <button onClick={resetFilters}>Reset</button>
          </div>

          <div className="academic-filter-grid">
          <div className="filter-group">
            <h3>Education Level</h3>
            <select
              value={level}
              onChange={(event) => handleLevelChange(event.target.value)}
            >
              <option value="All">All Levels</option>
              <option value="School">School</option>
              <option value="College">College / Intermediate</option>
              <option value="University">University</option>
              <option value="Online Courses">Online Courses</option>
            </select>
          </div>

          {level === "School" && (
            <div className="filter-group">
              <h3>Class</h3>
              <select
                value={academicDetails.classNumber}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({ ...previous, classNumber: event.target.value }));
                  setPage(1);
                }}
              >
                <option value="">Select your class</option>
                {Array.from({ length: 10 }, (_, index) => (
                  <option key={index + 1} value={String(index + 1)}>Class {index + 1}</option>
                ))}
              </select>
            </div>
          )}

          {level === "College" && <>
            <div className="filter-group">
              <h3>Year</h3>
              <select
                value={academicDetails.intermediateYear}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({ ...previous, intermediateYear: event.target.value }));
                  setPage(1);
                }}
              >
                <option value="">Select your year</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
              </select>
            </div>
            <div className="filter-group">
              <h3>College Program / Group</h3>
              <select
                value={academicDetails.stream}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({ ...previous, stream: event.target.value }));
                  setPage(1);
                }}
              >
                {INTERMEDIATE_STREAMS.map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </div>
          </>}

          {level === "University" && <>
            <div className="filter-group">
              <h3>Degree Level</h3>
              <select
                value={academicDetails.degreeLevel}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({
                    ...previous,
                    degreeLevel: event.target.value,
                    programChoice: "",
                    customProgram: "",
                  }));
                  setPage(1);
                }}
              >
                <option value="">Select degree</option>
                <option value="bs">BS / Bachelor's</option>
                <option value="masters">Master's</option>
                <option value="phd">PhD</option>
              </select>
            </div>
            {academicDetails.degreeLevel && <div className="filter-group">
              <h3>{academicDetails.degreeLevel === "bs" ? "BS / Bachelor's Program" : academicDetails.degreeLevel === "masters" ? "Master's Program" : "PhD Program"}</h3>
              <select
                value={academicDetails.programChoice}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({
                    ...previous,
                    programChoice: event.target.value,
                    customProgram: "",
                  }));
                  setPage(1);
                }}
              >
                <option value="">Select a program</option>
                {getProgramGroupsForDegreeLevel(academicDetails.degreeLevel).map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.programs.map((program) => <option key={program} value={program}>{program}</option>)}
                  </optgroup>
                ))}
                <option value="Other">Other</option>
              </select>
            </div>}
            {academicDetails.programChoice === "Other" && <div className="filter-group">
              <h3>Enter Your Program</h3>
              <input
                maxLength={100}
                value={academicDetails.customProgram}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({ ...previous, customProgram: event.target.value }));
                  setPage(1);
                }}
                placeholder="Type your degree program"
              />
            </div>}
          </>}

          {level === "Online Courses" && <>
            <div className="filter-group">
              <h3>Interest</h3>
              <select
                value={academicDetails.programChoice}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({
                    ...previous,
                    programChoice: event.target.value,
                    customProgram: "",
                  }));
                  setPage(1);
                }}
              >
                <option value="">Choose a course</option>
                {ONLINE_COURSES.map((course) => <option key={course} value={course}>{course}</option>)}
              </select>
            </div>
            {academicDetails.programChoice === "Other" && <div className="filter-group">
              <h3>Enter Course Name</h3>
              <input
                maxLength={100}
                value={academicDetails.customProgram}
                onChange={(event) => {
                  setAcademicDetails((previous) => ({ ...previous, customProgram: event.target.value }));
                  setPage(1);
                }}
                placeholder="Type the course area"
              />
            </div>}
          </>}

          </div>
        </aside>

        <div className="course-results">
          <div className="results-top">
            <div>
              <h2>
                {search.trim()
                  ? `${search.trim()} Learning Programs`
                  : category === "All"
                    ? "All Learning Programs"
                    : category}
              </h2>

              <p>{filteredCourses.length} courses found</p>
            </div>
          </div>
          <PublishedCourses
            educationProfile={level === "All" ? null : studentAcademicProfile}
            searchQuery={search}
            categoryFilter={category}
          />
          <div className="explore-course-grid">
            {visibleCourses.map((course) => (
              <article className="explore-course-card" key={course.id}>
                <ResilientImage src={course.image} alt={course.title} />

                <div className="explore-course-info">
                  <span className="course-category">
                    {course.category}
                  </span>

                  <h3>{course.title}</h3>

                  <p className="course-instructor">
                    {course.level} Education
                  </p>

                  <div className="course-meta">
                    <span>📚 {course.subjects.length} Subjects</span>
                    <span>▶ Video Topics</span>
                  </div>

                  <div className="course-meta">
                    <span>{course.subjects.slice(0, 3).join(" · ")}</span>
                  </div>

                  <div className="course-card-bottom">
                    <strong>Explore</strong>

                    <button onClick={() => selectCourse(course)}>
                      View Course
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {visibleCourses.length === 0 && (
            <div className="no-courses">
              <h3>No courses found</h3>
              <p>Try another search term or change your filters.</p>
              <button onClick={resetFilters}>Clear Filters</button>
            </div>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <button
                disabled={safePage === 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>

              <span>
                Page {safePage} of {totalPages}
              </span>

              <button
                disabled={safePage === totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default ExploreCourses;
