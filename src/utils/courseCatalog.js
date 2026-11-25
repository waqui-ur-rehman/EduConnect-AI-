// Shared course programs used by Explore Courses and the landing page.
export const imageSchool = "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=900";
const imageUniversity = "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=900";
const imageComputer = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900";
const imageScience = "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=900";
const imageBusiness = "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900";
const imageDesign = "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=900";
const schoolClassImages = [
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=900",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900",
  "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=900",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=900",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=900",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900",
  "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=900",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=900",
  imageScience,
  imageComputer,
  imageScience,
  imageUniversity
];
const pakistanBoards = [
  "FBISE Federal Board",
  "BISE Lahore",
  "BISE Rawalpindi",
  "BISE Gujranwala",
  "BISE Faisalabad",
  "BISE Multan",
  "BISE Sargodha",
  "BISE Bahawalpur",
  "BISE DG Khan",
  "BISE Sahiwal",
  "BISE Peshawar",
  "BISE Abbottabad",
  "BISE Swat",
  "BISE Mardan",
  "BISE Kohat",
  "BISE Bannu",
  "BISE DI Khan",
  "BISE Malakand",
  "BISE Karachi",
  "BISE Hyderabad",
  "BISE Sukkur",
  "BISE Larkana",
  "BISE Mirpurkhas",
  "BISE Quetta",
  "AJK BISE Mirpur",
  "Aga Khan University Examination Board"
];

const schoolSubjects = {
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
  11: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"],
  12: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"]
};

const professionalCourses = [
  { title: "Web Development", category: "Technology", level: "Professional", subjects: ["HTML", "CSS", "JavaScript", "React", "Node.js", "Databases"], image: imageComputer },
  { title: "Artificial Intelligence", category: "Technology", level: "Professional", subjects: ["AI Fundamentals", "Machine Learning", "Deep Learning", "Neural Networks", "Generative AI"], image: imageComputer },
  { title: "Machine Learning", category: "Technology", level: "Professional", subjects: ["Python", "Supervised Learning", "Unsupervised Learning", "Model Evaluation", "Neural Networks"], image: imageComputer },
  { title: "Data Science", category: "Technology", level: "Professional", subjects: ["Python", "Statistics", "Data Analysis", "Data Visualization", "Big Data"], image: imageComputer },
  { title: "Cyber Security", category: "Technology", level: "Professional", subjects: ["Security Fundamentals", "Network Security", "Cryptography", "Ethical Security Concepts"], image: imageComputer },
  { title: "Cloud Computing", category: "Technology", level: "Professional", subjects: ["Cloud Fundamentals", "Cloud Architecture", "Virtualization", "Cloud Security"], image: imageComputer },
  { title: "Mobile App Development", category: "Technology", level: "Professional", subjects: ["Android Development", "iOS Development", "React Native", "App Design"], image: imageComputer },
  { title: "Software Engineering", category: "Technology", level: "Professional", subjects: ["Software Design", "Programming", "Testing", "Software Architecture", "Project Management"], image: imageComputer },
  { title: "Networking", category: "Technology", level: "Professional", subjects: ["Networking Fundamentals", "Routing", "Switching", "Network Administration"], image: imageComputer },
  { title: "Database Management", category: "Technology", level: "Professional", subjects: ["SQL", "Database Design", "MongoDB", "Database Administration"], image: imageComputer },
  { title: "Graphic Design", category: "Design", level: "Professional", subjects: ["Design Principles", "Typography", "Branding", "Digital Illustration"], image: imageDesign },
  { title: "UI/UX Design", category: "Design", level: "Professional", subjects: ["User Research", "Wireframing", "Prototyping", "Usability Testing"], image: imageDesign },
  { title: "Digital Marketing", category: "Business", level: "Professional", subjects: ["SEO", "Social Media Marketing", "Content Marketing", "Analytics"], image: imageBusiness },
  { title: "Business Administration", category: "Business", level: "Professional", subjects: ["Management", "Leadership", "Business Strategy", "Operations"], image: imageBusiness },
  { title: "Accounting and Finance", category: "Business", level: "Professional", subjects: ["Financial Accounting", "Cost Accounting", "Auditing", "Corporate Finance"], image: imageBusiness },
  { title: "Physics", category: "Science", level: "Professional", subjects: ["Classical Mechanics", "Electromagnetism", "Quantum Physics", "Thermodynamics"], image: imageScience },
  { title: "Chemistry", category: "Science", level: "Professional", subjects: ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Analytical Chemistry"], image: imageScience },
  { title: "Biology", category: "Science", level: "Professional", subjects: ["Cell Biology", "Genetics", "Microbiology", "Ecology"], image: imageScience },
  { title: "Mathematics", category: "Science", level: "Professional", subjects: ["Calculus", "Linear Algebra", "Differential Equations", "Statistics"], image: imageScience },
  { title: "Psychology", category: "Social Sciences", level: "Professional", subjects: ["Introduction to Psychology", "Cognitive Psychology", "Developmental Psychology", "Research Methods"], image: imageUniversity },
  { title: "Economics", category: "Business", level: "Professional", subjects: ["Microeconomics", "Macroeconomics", "Development Economics", "Econometrics"], image: imageBusiness },
  { title: "Law", category: "Humanities", level: "Professional", subjects: ["Legal Systems", "Constitutional Law", "Contract Law", "International Law"], image: imageUniversity },
  { title: "Education", category: "Humanities", level: "Professional", subjects: ["Teaching Methods", "Educational Psychology", "Curriculum Design", "Assessment"], image: imageUniversity },
  { title: "Languages and Literature", category: "Humanities", level: "Professional", subjects: ["English Literature", "Linguistics", "Academic Writing", "Language Learning"], image: imageUniversity },
  { title: "Engineering", category: "Engineering", level: "Professional", subjects: ["Mechanical Engineering", "Electrical Engineering", "Civil Engineering", "Engineering Mathematics"], image: imageScience },
  { title: "Medical and Health Sciences", category: "Health Sciences", level: "Professional", subjects: ["Anatomy", "Physiology", "Biochemistry", "Public Health"], image: imageScience },
  { title: "Environmental Science", category: "Science", level: "Professional", subjects: ["Climate Science", "Ecology", "Conservation", "Environmental Management"], image: imageScience },
  { title: "Research Methods", category: "Research", level: "Professional", subjects: ["Research Design", "Academic Writing", "Data Collection", "Research Ethics"], image: imageUniversity }
];

const degreeCourses = [
  { title: "Associate Degree Programs", category: "College", level: "College", subjects: ["Arts", "Science", "Business", "Computer Studies"], image: imageUniversity },
  { title: "FA and Arts", category: "College", level: "College", subjects: ["English", "Urdu", "Civics", "Education", "Economics", "History"], image: imageUniversity },
  { title: "FSc Pre-Medical", category: "College", level: "College", subjects: ["Biology", "Chemistry", "Physics", "English"], image: imageScience },
  { title: "FSc Pre-Engineering", category: "College", level: "College", subjects: ["Mathematics", "Physics", "Chemistry", "English"], image: imageScience },
  { title: "ICS", category: "College", level: "College", subjects: ["Computer Science", "Mathematics", "Physics", "Statistics"], image: imageComputer },
  { title: "ICom", category: "College", level: "College", subjects: ["Accounting", "Business", "Economics", "Commerce"], image: imageBusiness },
  { title: "BS Computer Science", category: "Undergraduate", level: "Undergraduate", subjects: ["Programming", "Data Structures", "Algorithms", "Operating Systems", "Databases"], image: imageComputer },
  { title: "BS Software Engineering", category: "Undergraduate", level: "Undergraduate", subjects: ["Software Design", "Programming", "Software Testing", "Project Management"], image: imageComputer },
  { title: "BS Information Technology", category: "Undergraduate", level: "Undergraduate", subjects: ["IT Fundamentals", "Networking", "Databases", "Web Technologies"], image: imageComputer },
  { title: "BS Artificial Intelligence", category: "Undergraduate", level: "Undergraduate", subjects: ["Python", "Machine Learning", "Deep Learning", "Data Science"], image: imageComputer },
  { title: "BS Data Science", category: "Undergraduate", level: "Undergraduate", subjects: ["Statistics", "Data Mining", "Python", "Machine Learning"], image: imageComputer },
  { title: "BBA", category: "Undergraduate", level: "Undergraduate", subjects: ["Management", "Marketing", "Finance", "Human Resources"], image: imageBusiness },
  { title: "BCom", category: "Undergraduate", level: "Undergraduate", subjects: ["Accounting", "Auditing", "Business Law", "Taxation"], image: imageBusiness },
  { title: "BS Mathematics", category: "Undergraduate", level: "Undergraduate", subjects: ["Calculus", "Algebra", "Statistics", "Numerical Analysis"], image: imageScience },
  { title: "BS Physics", category: "Undergraduate", level: "Undergraduate", subjects: ["Mechanics", "Electromagnetism", "Quantum Physics", "Thermodynamics"], image: imageScience },
  { title: "BS Chemistry", category: "Undergraduate", level: "Undergraduate", subjects: ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Analytical Chemistry"], image: imageScience },
  { title: "BS Biology", category: "Undergraduate", level: "Undergraduate", subjects: ["Genetics", "Microbiology", "Cell Biology", "Ecology"], image: imageScience },
  { title: "BS Psychology", category: "Undergraduate", level: "Undergraduate", subjects: ["Cognitive Psychology", "Social Psychology", "Research Methods", "Developmental Psychology"], image: imageUniversity },
  { title: "BS English", category: "Undergraduate", level: "Undergraduate", subjects: ["Literature", "Linguistics", "Grammar", "Academic Writing"], image: imageUniversity },
  { title: "BS Economics", category: "Undergraduate", level: "Undergraduate", subjects: ["Microeconomics", "Macroeconomics", "Econometrics", "Development Economics"], image: imageBusiness },
  { title: "MBBS Study Resources", category: "Health Sciences", level: "Undergraduate", subjects: ["Anatomy", "Physiology", "Biochemistry", "Pathology"], image: imageScience },
  { title: "Doctor of Pharmacy", category: "Health Sciences", level: "Undergraduate", subjects: ["Pharmacology", "Pharmaceutics", "Medicinal Chemistry", "Pharmacognosy"], image: imageScience },
  { title: "BS Civil Engineering", category: "Engineering", level: "Undergraduate", subjects: ["Structural Engineering", "Geotechnical Engineering", "Surveying", "Fluid Mechanics"], image: imageScience },
  { title: "BS Electrical Engineering", category: "Engineering", level: "Undergraduate", subjects: ["Circuit Analysis", "Electronics", "Power Systems", "Control Systems"], image: imageScience },
  { title: "MS Computer Science", category: "Postgraduate", level: "Postgraduate", subjects: ["Advanced Algorithms", "AI Research", "Distributed Systems", "Advanced Databases"], image: imageComputer },
  { title: "MS Data Science", category: "Postgraduate", level: "Postgraduate", subjects: ["Advanced Statistics", "Machine Learning", "Big Data", "Research Project"], image: imageComputer },
  { title: "MBA", category: "Postgraduate", level: "Postgraduate", subjects: ["Strategic Management", "Finance", "Marketing", "Business Analytics"], image: imageBusiness },
  { title: "MPhil Education", category: "Postgraduate", level: "MPhil", subjects: ["Advanced Pedagogy", "Educational Research", "Curriculum Studies", "Thesis"], image: imageUniversity },
  { title: "MSc Mathematics", category: "Postgraduate", level: "Postgraduate", subjects: ["Real Analysis", "Abstract Algebra", "Topology", "Applied Mathematics"], image: imageScience },
  { title: "PhD Computer Science", category: "Doctoral", level: "PhD", subjects: ["Advanced Computing Research", "AI Research", "Algorithms Research", "Dissertation"], image: imageComputer },
  { title: "PhD Artificial Intelligence", category: "Doctoral", level: "PhD", subjects: ["Machine Learning Research", "Deep Learning Research", "AI Ethics", "Dissertation"], image: imageComputer },
  { title: "PhD Physics", category: "Doctoral", level: "PhD", subjects: ["Theoretical Physics", "Experimental Research", "Quantum Mechanics", "Dissertation"], image: imageScience },
  { title: "PhD Biology", category: "Doctoral", level: "PhD", subjects: ["Molecular Biology", "Genetics Research", "Bioinformatics", "Dissertation"], image: imageScience },
  { title: "PhD Business and Management", category: "Doctoral", level: "PhD", subjects: ["Management Research", "Business Strategy", "Research Methods", "Dissertation"], image: imageBusiness }
];

const schoolCourses = Array.from({ length: 12 }, (_, index) => {
  const classNumber = index + 1;

  return {
    id: `school-${classNumber}`,
    title: `Class ${classNumber} Complete Study Program`,
    category: `Class ${classNumber}`,
    level:
      classNumber <= 5
        ? "Primary"
        : classNumber <= 8
          ? "Middle"
          : classNumber <= 10
            ? "Secondary"
            : "Higher Secondary",
    subjects: schoolSubjects[classNumber],
    image: schoolClassImages[index],
    boards: pakistanBoards,
    description: `Study the main subjects of Class ${classNumber} with organized topics, video lesson searches and learning resources.`
  };
});

export const coursePrograms = [
  ...schoolCourses,
  ...degreeCourses.map((course, index) => ({
    ...course,
    id: `degree-${index}`,
    image: course.image || imageUniversity,
    description: `Explore ${course.title}, its major subjects, learning topics and video lesson resources.`
  })),
  ...professionalCourses.map((course, index) => ({
    ...course,
    id: `professional-${index}`,
    image: course.image || imageComputer,
    description: `Explore ${course.title} through its key subjects, learning topics and video lesson resources.`
  }))
];

