import { isModerationVisible } from "./moderationVisibility";
import { loadContentFile } from "./contentApi";

const SCHOOL_SUBJECTS = {
  1: ["English", "Urdu", "Mathematics", "General Knowledge"],
  2: ["English", "Urdu", "Mathematics", "General Knowledge"],
  3: ["English", "Urdu", "Mathematics", "General Science", "Social Studies"],
  4: ["English", "Urdu", "Mathematics", "General Science", "Social Studies"],
  5: ["English", "Urdu", "Mathematics", "General Science", "Social Studies"],
  6: ["English", "Urdu", "Mathematics", "Science", "Computer", "Social Studies"],
  7: ["English", "Urdu", "Mathematics", "Science", "Computer", "Social Studies"],
  8: ["English", "Urdu", "Mathematics", "Science", "Computer", "Social Studies"],
  9: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"],
  10: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"],
};

const INTERMEDIATE_SUBJECTS = {
  PreMedical: ["English", "Urdu", "Physics", "Chemistry", "Biology"],
  PreEngineering: ["English", "Urdu", "Mathematics", "Physics", "Chemistry"],
  ICS: ["English", "Urdu", "Computer Science", "Mathematics", "Physics"],
  Commerce: ["English", "Urdu", "Accounting", "Commerce", "Economics"],
  Arts: ["English", "Urdu", "Civics", "Education", "Economics", "History"],
};

const PROGRAM_SUBJECTS = {
  it: ["IT Fundamentals", "Networking", "Databases", "Web Technologies"],
  "information technology": ["IT Fundamentals", "Networking", "Databases", "Web Technologies"],
  "computer science": ["Programming", "Data Structures", "Algorithms", "Operating Systems", "Databases"],
  "software engineering": ["Software Design", "Programming", "Software Testing", "Project Management"],
  "artificial intelligence": ["Python", "Machine Learning", "Deep Learning", "Data Science"],
  "data science": ["Statistics", "Data Mining", "Python", "Machine Learning"],
  "business administration": ["Management", "Marketing", "Finance", "Human Resources"],
  bba: ["Management", "Marketing", "Finance", "Human Resources"],
  mbbs: ["Anatomy", "Physiology", "Biochemistry", "Pathology"],
  "bs physics": ["Mechanics", "Electromagnetism", "Quantum Physics", "Thermodynamics"],
  "bs chemistry": ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Analytical Chemistry"],
  "bs biology": ["Genetics", "Microbiology", "Cell Biology", "Ecology"],
  "bs mathematics": ["Calculus", "Algebra", "Statistics", "Numerical Analysis"],
  "bs psychology": ["Cognitive Psychology", "Social Psychology", "Research Methods", "Developmental Psychology"],
  "bs english": ["Literature", "Linguistics", "Grammar", "Academic Writing"],
  "bs economics": ["Microeconomics", "Macroeconomics", "Econometrics", "Development Economics"],
  "bs civil engineering": ["Structural Engineering", "Geotechnical Engineering", "Surveying", "Fluid Mechanics"],
  "bs electrical engineering": ["Circuit Analysis", "Electronics", "Power Systems", "Control Systems"],
  "doctor of pharmacy": ["Pharmacology", "Pharmaceutics", "Medicinal Chemistry", "Pharmacognosy"],
  "ms computer science": ["Advanced Algorithms", "AI Research", "Distributed Systems", "Advanced Databases"],
  "ms data science": ["Advanced Statistics", "Machine Learning", "Big Data", "Research Project"],
  mba: ["Strategic Management", "Finance", "Marketing", "Business Analytics"],
  "mphil education": ["Advanced Pedagogy", "Educational Research", "Curriculum Studies", "Thesis"],
  "msc mathematics": ["Real Analysis", "Abstract Algebra", "Topology", "Applied Mathematics"],
  "phd computer science": ["Advanced Computing Research", "AI Research", "Algorithms Research", "Dissertation"],
  "phd artificial intelligence": ["Machine Learning Research", "Deep Learning Research", "AI Ethics", "Dissertation"],
  "phd physics": ["Theoretical Physics", "Experimental Research", "Quantum Mechanics", "Dissertation"],
  "phd biology": ["Molecular Biology", "Genetics Research", "Bioinformatics", "Dissertation"],
  "phd business and management": ["Management Research", "Business Strategy", "Research Methods", "Dissertation"],
  "web development": ["HTML", "CSS", "JavaScript", "React", "Node.js", "Databases"],
  "machine learning": ["Python", "Supervised Learning", "Unsupervised Learning", "Model Evaluation"],
  "cyber security": ["Security Fundamentals", "Network Security", "Cryptography", "Ethical Security Concepts"],
  "cloud computing": ["Cloud Fundamentals", "Cloud Architecture", "Virtualization", "Cloud Security"],
  "mobile app development": ["Android Development", "iOS Development", "React Native", "App Design"],
  networking: ["Networking Fundamentals", "Routing", "Switching", "Network Administration"],
  "database management": ["SQL", "Database Design", "MongoDB", "Database Administration"],
  "graphic design": ["Design Principles", "Typography", "Branding", "Digital Illustration"],
  "ui/ux design": ["User Research", "Wireframing", "Prototyping", "Usability Testing"],
  "digital marketing": ["SEO", "Social Media Marketing", "Content Marketing", "Analytics"],
};

const UNIVERSITY_PROGRAM_GROUPS = {
  bs: [
    { label: "Computer & IT Programs", programs: ["BS Computer Science (BSCS)", "BS Information Technology (BSIT)", "BS Software Engineering (BSSE)", "BS Artificial Intelligence (BSAI)", "BS Data Science", "BS Cyber Security", "BS Information Systems", "BS Computer Engineering", "BS Game Development", "BS Cloud Computing", "BS Robotics", "BS Bioinformatics"] },
    { label: "Business & Management Programs", programs: ["BBA (Business Administration)", "BS Accounting & Finance", "BS Commerce", "BS Economics", "BS Banking & Finance", "BS Business Analytics", "BS Entrepreneurship", "BS Marketing", "BS Human Resource Management", "BS Supply Chain Management", "BS Public Administration", "BS Project Management", "BS Tourism & Hospitality Management"] },
    { label: "Science Programs", programs: ["BS Mathematics", "BS Physics", "BS Chemistry", "BS Statistics", "BS Biology", "BS Biotechnology", "BS Biochemistry", "BS Microbiology", "BS Zoology", "BS Botany", "BS Environmental Science", "BS Food Science & Technology", "BS Geology", "BS Geography", "BS Forensic Science"] },
    { label: "Medical & Health Sciences", programs: ["BS Nursing", "BS Medical Laboratory Technology", "BS Radiology Technology", "BS Medical Imaging Technology", "BS Anesthesia Technology", "BS Operation Theatre Technology", "BS Nutrition & Dietetics", "BS Public Health", "BS Psychology", "BS Optometry", "BS Dental Technology", "BS Emergency Care Technology", "BS Respiratory Therapy", "BS Speech & Language Pathology"] },
    { label: "Arts & Social Sciences", programs: ["BS English", "BS Urdu", "BS Islamic Studies", "BS Pakistan Studies", "BS Political Science", "BS International Relations", "BS Sociology", "BS Social Work", "BS Education", "BS History", "BS Philosophy", "BS Anthropology", "BS Criminology", "BS Gender Studies", "BS Media & Communication Studies", "BS Journalism", "BS Linguistics", "BS Fine Arts", "BS Graphic Design"] },
    { label: "Engineering & Technology", programs: ["BS Electrical Engineering", "BS Mechanical Engineering", "BS Civil Engineering", "BS Chemical Engineering", "BS Biomedical Engineering", "BS Mechatronics Engineering", "BS Aerospace Engineering", "BS Industrial Engineering", "BS Electronics Engineering", "BS Telecommunication Engineering", "BS Environmental Engineering", "BS Energy Systems Engineering"] },
    { label: "Agriculture & Other Programs", programs: ["BS Agriculture", "BS Agronomy", "BS Horticulture", "BS Forestry", "BS Fisheries", "BS Animal Sciences", "BS Plant Breeding & Genetics", "BS Soil Science", "BS Library & Information Science", "BS Textile Design", "BS Fashion Design", "BS Interior Design", "BS Architecture Technology", "BS Sports Sciences", "BS Aviation Management"] },
  ],
  masters: [
    { label: "Computer & IT", programs: ["MS Computer Science", "MS Information Technology", "MS Software Engineering", "MS Artificial Intelligence", "MS Data Science", "MS Cyber Security", "MS Information Security", "MS Computer Engineering", "MS Information Systems", "MS Bioinformatics"] },
    { label: "Business & Management", programs: ["MS Management Sciences", "MS Accounting & Finance", "MS Finance", "MS Economics", "MS Business Analytics", "MS Marketing", "MS Human Resource Management", "MS Supply Chain Management", "MS Project Management", "MS Entrepreneurship", "MS Commerce", "MS Public Administration"] },
    { label: "Natural Sciences", programs: ["MS Mathematics", "MS Physics", "MS Chemistry", "MS Statistics", "MS Biotechnology", "MS Biochemistry", "MS Microbiology", "MS Zoology", "MS Botany", "MS Environmental Sciences", "MS Food Science & Technology", "MS Geology", "MS Molecular Biology"] },
    { label: "Medical & Health Sciences", programs: ["MS Nursing", "Master of Public Health (MPH)", "MS Public Health", "MS Clinical Psychology", "MS Nutrition & Dietetics", "MS Medical Laboratory Sciences", "MS Biomedical Sciences", "MS Epidemiology", "MS Rehabilitation Sciences", "MS Healthcare Management"] },
    { label: "Arts & Social Sciences", programs: ["MS English Literature", "MS English Linguistics", "MPhil Urdu", "MPhil Islamic Studies", "MPhil Pakistan Studies", "MPhil Political Science", "MS International Relations", "MPhil Sociology", "MPhil Education", "MPhil History", "MPhil Philosophy", "MPhil Anthropology", "MS Criminology", "MS Media & Communication Studies", "MPhil Psychology", "MS Development Studies", "MPhil Gender Studies"] },
    { label: "Engineering & Technology", programs: ["MS Electrical Engineering", "MS Mechanical Engineering", "MS Civil Engineering", "MS Chemical Engineering", "MS Biomedical Engineering", "MS Mechatronics Engineering", "MS Aerospace Engineering", "MS Industrial Engineering", "MS Electronics Engineering", "MS Telecommunication Engineering", "MS Environmental Engineering", "MS Energy Systems Engineering", "MS Engineering Management"] },
    { label: "Agriculture & Other Programs", programs: ["MS Agriculture", "MS Agronomy", "MS Horticulture", "MS Forestry", "MS Fisheries", "MS Animal Sciences", "MS Plant Breeding & Genetics", "MS Soil Science", "MS Library & Information Science", "MS Sports Sciences", "MS Food Technology"] },
  ],
  phd: [
    { label: "Computer & IT Programs", programs: ["PhD Computer Science", "PhD Information Technology", "PhD Software Engineering", "PhD Artificial Intelligence", "PhD Data Science", "PhD Cyber Security", "PhD Information Security", "PhD Computer Engineering", "PhD Information Systems", "PhD Bioinformatics", "PhD Robotics", "PhD Machine Learning"] },
    { label: "Business & Management Programs", programs: ["PhD Management Sciences", "PhD Business Administration", "PhD Accounting & Finance", "PhD Finance", "PhD Economics", "PhD Business Analytics", "PhD Marketing", "PhD Human Resource Management", "PhD Supply Chain Management", "PhD Entrepreneurship", "PhD Commerce", "PhD Public Administration"] },
    { label: "Natural Sciences", programs: ["PhD Mathematics", "PhD Physics", "PhD Chemistry", "PhD Statistics", "PhD Biotechnology", "PhD Biochemistry", "PhD Microbiology", "PhD Zoology", "PhD Botany", "PhD Environmental Sciences", "PhD Food Science & Technology", "PhD Geology", "PhD Molecular Biology", "PhD Biological Sciences", "PhD Applied Mathematics"] },
    { label: "Medical & Health Sciences", programs: ["PhD Nursing", "PhD Public Health", "PhD Clinical Psychology", "PhD Nutrition & Dietetics", "PhD Biomedical Sciences", "PhD Epidemiology", "PhD Rehabilitation Sciences", "PhD Medical Sciences", "PhD Pharmacology", "PhD Pharmacy", "PhD Physiology", "PhD Anatomy", "PhD Health Sciences"] },
    { label: "Arts & Social Sciences", programs: ["PhD English Literature", "PhD English Linguistics", "PhD Urdu", "PhD Islamic Studies", "PhD Pakistan Studies", "PhD Political Science", "PhD International Relations", "PhD Sociology", "PhD Education", "PhD History", "PhD Philosophy", "PhD Anthropology", "PhD Criminology", "PhD Media & Communication Studies", "PhD Psychology", "PhD Development Studies", "PhD Gender Studies", "PhD Social Work"] },
    { label: "Engineering & Technology", programs: ["PhD Electrical Engineering", "PhD Mechanical Engineering", "PhD Civil Engineering", "PhD Chemical Engineering", "PhD Biomedical Engineering", "PhD Mechatronics Engineering", "PhD Aerospace Engineering", "PhD Industrial Engineering", "PhD Electronics Engineering", "PhD Telecommunication Engineering", "PhD Environmental Engineering", "PhD Energy Systems Engineering", "PhD Engineering Management", "PhD Materials Engineering", "PhD Structural Engineering"] },
    { label: "Agriculture & Other Programs", programs: ["PhD Agriculture", "PhD Agronomy", "PhD Horticulture", "PhD Forestry", "PhD Fisheries", "PhD Animal Sciences", "PhD Plant Breeding & Genetics", "PhD Soil Science", "PhD Food Technology", "PhD Veterinary Sciences", "PhD Agricultural Economics", "PhD Plant Pathology", "PhD Entomology", "PhD Library & Information Science", "PhD Sports Sciences"] },
  ],
};

export const ONLINE_COURSES = [
  "Information Technology (IT)",
  "Computer Science",
  "Artificial Intelligence (AI)",
  "Web Development",
  "Software Development",
  "Programming Languages",
  "Data Science",
  "Data Analytics",
  "Machine Learning",
  "Cyber Security",
  "Cloud Computing",
  "Networking",
  "Mobile App Development",
  "Game Development",
  "Database Management",
  "DevOps",
  "Software Engineering",
  "Graphic Design",
  "UI/UX Design",
  "Web Design",
  "Digital Marketing",
  "Video Editing",
  "Animation",
  "3D Modeling & Design",
  "E-Commerce",
  "WordPress Development",
  "Blockchain & Web3",
  "Robotics",
  "Internet of Things (IoT)",
  "Computer Hardware",
  "IT Support",
  "Operating Systems",
  "Software Testing & QA",
  "Business & Management",
  "Accounting & Finance",
  "Entrepreneurship",
  "Project Management",
  "Office Productivity",
  "Freelancing",
  "Photography",
  "Content Creation",
  "Search Engine Optimization (SEO)",
  "Social Media Marketing",
  "Education & Teaching",
  "Languages & Communication",
  "Personal Development",
  "Health & Fitness",
  "Science & Mathematics",
  "Engineering & Technology",
  "Architecture & Interior Design",
  "Music & Audio Production",
  "Writing & Content Development",
  "Career Development",
  "Agriculture & Environmental Sciences",
  "Fashion & Textile Design",
  "Business Analytics",
  "Digital Skills",
  "Automation Technology",
  "Data Engineering",
  "Emerging Technologies",
  // Keep the other course options already available in the profile catalog.
  "Business Administration",
  "Accounting and Finance",
  "Physics",
  "Chemistry",
  "Biology",
  "Mathematics",
  "Psychology",
  "Economics",
  "Law",
  "Education",
  "Languages and Literature",
  "Engineering",
  "Medical and Health Sciences",
  "Environmental Science",
  "Research Methods",
  "Other",
];

export function getProgramsForDegreeLevel(level) {
  return (UNIVERSITY_PROGRAM_GROUPS[level] || []).flatMap((group) => group.programs);
}

export function getProgramGroupsForDegreeLevel(level) {
  return UNIVERSITY_PROGRAM_GROUPS[level] || [];
}

export const INTERMEDIATE_STREAMS = [
  ["PreMedical", "FSc Pre-Medical"],
  ["PreEngineering", "FSc Pre-Engineering"],
  ["ICS", "ICS"],
  ["Commerce", "ICom / Commerce"],
  ["Arts", "FA / Arts"],
];

export function getStudentAcademicSubjects(profile = {}) {
  if (profile.educationLevel === "school") return SCHOOL_SUBJECTS[Number(profile.classNumber)] || [];
  if (profile.educationLevel === "intermediate") return INTERMEDIATE_SUBJECTS[profile.stream] || INTERMEDIATE_SUBJECTS.PreEngineering;
  if (profile.educationLevel === "university" || profile.educationLevel === "online") {
    const program = String(profile.program || "").trim().toLowerCase();
    const matchingKey = Object.keys(PROGRAM_SUBJECTS).sort((a, b) => b.length - a.length).find((key) => program.includes(key));
    return PROGRAM_SUBJECTS[program] || PROGRAM_SUBJECTS[matchingKey] || [];
  }
  return [];
}

export function getStudentAcademicContext(profile = {}) {
  const subjects = getStudentAcademicSubjects(profile);
  if (profile.educationLevel === "school" && profile.classNumber) {
    const grade = Number(profile.classNumber);
    return { title: `Class ${grade}`, subjects };
  }
  if (profile.educationLevel === "intermediate" && profile.intermediateYear) {
    const year = Number(profile.intermediateYear);
    const courseTitle = INTERMEDIATE_STREAMS.find(([key]) => key === profile.stream)?.[1] || "Intermediate";
    return { title: `${year === 2 ? "2nd" : "1st"}-Year ${courseTitle}`, subjects };
  }
  if (profile.educationLevel === "university" && profile.program?.trim()) {
    const program = profile.program.trim();
    return { title: program, subjects };
  }
  if (profile.educationLevel === "online" && profile.program?.trim()) {
    const program = profile.program.trim();
    return { title: `${program} Interest`, subjects };
  }
  return { title: "your studies", subjects };
}

export function normalizeRecommendationText(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function hasPhrase(haystack, needle) {
  const text = normalizeRecommendationText(haystack);
  const phrase = normalizeRecommendationText(needle);
  return Boolean(phrase && (` ${text} `).includes(` ${phrase} `));
}

export function isAcademicProfileComplete(profile = {}) {
  if (profile.educationLevel === "school") return Boolean(profile.classNumber);
  if (profile.educationLevel === "intermediate") return Boolean(profile.intermediateYear && profile.stream);
  if (profile.educationLevel === "university") return Boolean(profile.degreeLevel && profile.program?.trim());
  if (profile.educationLevel === "online") return Boolean(profile.program?.trim());
  return false;
}

export function getCourseRecommendationScore(course, profile = {}) {
  const academic = getStudentAcademicContext(profile);
  const program = String(profile.program || "").trim();
  const structured = [course.educationLevel, course.educationLevels, course.targetLevel, course.grade, course.classNumber, course.program, course.programs, course.subject, course.subjects, course.specialization, course.tags]
    .flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
  const title = String(course.title || "");
  const description = String(course.description || "");
  const category = String(course.category || "");
  const teacherProfile = course.instructorProfile || {};
  const searchable = [title, description, category, ...structured, teacherProfile.expertise, teacherProfile.headline].join(" ");

  const explicitLevel = normalizeRecommendationText(course.educationLevel || course.targetLevel || "");
  if (explicitLevel && profile.educationLevel === "school" && !explicitLevel.includes("school") && !hasPhrase(explicitLevel, `class ${profile.classNumber}`)) return 0;
  if (explicitLevel && profile.educationLevel === "university" && !["university", "undergraduate", "postgraduate", "doctoral", profile.degreeLevel].some((level) => level && explicitLevel.includes(normalizeRecommendationText(level)))) return 0;
  if (explicitLevel && profile.educationLevel === "intermediate" && !["college", "intermediate", "higher secondary"].some((level) => explicitLevel.includes(level))) return 0;

  const courseClass = Number(course.classNumber || course.grade || 0);
  if (profile.educationLevel === "school" && courseClass && courseClass !== Number(profile.classNumber)) return 0;
  const courseYear = Number(course.intermediateYear || course.year || 0);
  if (profile.educationLevel === "intermediate" && courseYear && courseYear !== Number(profile.intermediateYear)) return 0;
  if (profile.educationLevel === "intermediate" && course.stream && profile.stream
    && normalizeRecommendationText(course.stream) !== normalizeRecommendationText(profile.stream)) return 0;
  const explicitPrograms = [course.program, course.programs].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  if (program && explicitPrograms.length && !explicitPrograms.some((value) => hasPhrase(value, program) || hasPhrase(program, value))) return 0;

  let score = 0;
  const normalizedProgram = normalizeRecommendationText(program);
  const programFields = [course.program, course.programs, course.title, course.description, category, teacherProfile.expertise]
    .flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
  if (normalizedProgram && programFields.some((value) => hasPhrase(value, program))) score += 8;

  for (const subject of academic.subjects) {
    const subjectFields = [course.subject, course.subjects, course.specialization, course.tags]
      .flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
    if (subjectFields.some((value) => hasPhrase(value, subject))) score += 5;
    else if (hasPhrase(searchable, subject)) score += 3;
  }

  if (/^class \d+$/.test(normalizeRecommendationText(academic.title)) && hasPhrase(searchable, academic.title)) score += 5;
  if (academic.title !== "your studies" && academic.title !== program && hasPhrase(searchable, academic.title)) score += 4;
  return score;
}

export function getRelatedPublishedCourses(courses, profile = {}) {
  const unique = new Map();
  courses.forEach((course) => {
    const recommendationScore = getCourseRecommendationScore(course, profile);
    if (recommendationScore <= 0) return;
    const key = `${String(course.teacherEmail || "").toLowerCase()}::${course.id}`;
    const previous = unique.get(key);
    if (!previous || recommendationScore > previous.recommendationScore) unique.set(key, { ...course, recommendationScore });
  });
  return [...unique.values()].sort((a, b) => b.recommendationScore - a.recommendationScore || String(a.title || "").localeCompare(String(b.title || "")));
}

export function getCourseReviewSummaries(courses = [], reviews = []) {
  return new Map(courses.map((course) => {
    const email = String(course.teacherEmail || "").trim().toLowerCase();
    const key = `${email}::${course.id}`;
    const matched = reviews.filter((review) => String(review.courseKey || "").toLowerCase() === key && Number(review.rating) > 0 && Number(review.rating) <= 5);
    return [key, { rating: matched.length ? matched.reduce((sum, review) => sum + Number(review.rating), 0) / matched.length : null, reviewCount: matched.length }];
  }));
}

export function rankRelatedTeachers(courses, reviews) {
  const byTeacher = new Map();
  courses.forEach((course) => {
    const email = String(course.teacherEmail || "").toLowerCase();
    const key = `${email}:${course.instructorName || "teacher"}`;
    const courseReviews = reviews.filter((review) => String(review.courseKey || "").toLowerCase() === `${email}::${course.id}` && Number(review.rating) > 0 && Number(review.rating) <= 5);
    const entry = byTeacher.get(key) || { key, name: course.instructorName || email.split("@")[0] || "Teacher", email, profile: course.instructorProfile || {}, courses: new Set(), subjects: new Set(), teachingLevels: new Set(), programs: new Set(), ratings: [], reviewCount: 0 };
    entry.courses.add(course.title);
    [course.subject, course.subjects, course.specialization, course.tags, course.instructorProfile?.expertise]
      .flatMap((value) => Array.isArray(value) ? value : value ? [value] : []).forEach((value) => entry.subjects.add(String(value)));
    [course.educationLevel, course.targetLevel, course.classNumber ? `Class ${course.classNumber}` : "", course.intermediateYear ? `${course.intermediateYear}${Number(course.intermediateYear) === 2 ? "nd" : "st"}-Year` : ""]
      .filter(Boolean).forEach((value) => entry.teachingLevels.add(String(value)));
    [course.program, course.programs].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []).forEach((value) => entry.programs.add(String(value)));
    courseReviews.forEach((review) => entry.ratings.push(Number(review.rating)));
    entry.reviewCount += courseReviews.length;
    byTeacher.set(key, entry);
  });
  return [...byTeacher.values()].map((teacher) => ({
    ...teacher,
    courses: [...teacher.courses],
    subjects: [...teacher.subjects],
    teachingLevels: [...teacher.teachingLevels],
    programs: [...teacher.programs],
    rating: teacher.ratings.length ? teacher.ratings.reduce((sum, rating) => sum + rating, 0) / teacher.ratings.length : null,
  })).sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount || a.name.localeCompare(b.name)).slice(0, 4);
}

const CURRICULUM_PREFIX = "educonnect.curriculum.v1.";
const CURRICULUM_DB = "educonnect-curriculum-resources";
const CURRICULUM_STORE = "files";

export function getPublishedPdfResources(courses = [], includeModerated = false) {
  const resources = [];
  const seen = new Set();
  for (const course of courses) {
    if (!course.teacherEmail || !course.id) continue;
    const key = `${CURRICULUM_PREFIX}${encodeURIComponent(String(course.teacherEmail).toLowerCase())}.${encodeURIComponent(String(course.id))}`;
    try {
      const curriculum = course.mongoContent ? course.curriculum || {} : JSON.parse(window.localStorage.getItem(key) || "{}");
      (Array.isArray(curriculum.resources) ? curriculum.resources : []).filter((resource) => /\.pdf$/i.test(resource.name || "")).forEach((resource) => {
        const resourceKey = `${String(course.teacherEmail).toLowerCase()}::${course.id}::${resource.id}`;
        if (!includeModerated && !isModerationVisible("pdf", resourceKey)) return;
        if (seen.has(resourceKey)) return;
        seen.add(resourceKey);
        resources.push({ ...resource, course, teacherEmail: course.teacherEmail, instructorName: course.instructorName || "Instructor" });
      });
    } catch { /* Ignore malformed curriculum metadata and continue with published courses. */ }
  }
  return resources;
}

export async function loadCurriculumResource(resourceId) {
  if (String(resourceId).startsWith("remote:")) return loadContentFile(resourceId);
  if (typeof window === "undefined" || !window.indexedDB) throw new Error("File storage is unavailable.");
  const db = await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CURRICULUM_DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(CURRICULUM_STORE)) request.result.createObjectStore(CURRICULUM_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const file = await new Promise((resolve, reject) => {
      const request = db.transaction(CURRICULUM_STORE, "readonly").objectStore(CURRICULUM_STORE).get(resourceId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!file) throw new Error("This PDF file is no longer available in this browser.");
    return file;
  } finally { db.close(); }
}

export function getRelatedLearningSuggestions(profile = {}) {
  const academic = getStudentAcademicContext(profile);
  return academic.subjects;
}
