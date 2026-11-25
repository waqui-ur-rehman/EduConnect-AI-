import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Code2, FlaskConical, Globe, GraduationCap, HeartPulse, Layers, Leaf, LifeBuoy, Mail, Menu, Monitor, Palette, Play, Quote, Route, Search, ShoppingCart, Sparkles, Star, Target, UserRound, X, Zap } from "lucide-react";
import { loadBookFile } from "../../utils/books";
import { featuredLandingCourses, landingCatalogUrl, landingCourseUrl, readLandingCatalog, searchLandingCatalog } from "./landingData";
import { STUDY_PARTNERS } from "./studyPartnerData";
import StudyPartners from "./StudyPartners";
import heroPhoto from "../../assets/landing/student-headphones-landscape.jpg";
import learningArtwork from "../../assets/student-learning-paths.svg";
import reactLogo from "../../assets/partners/react.svg";
import pythonLogo from "../../assets/partners/python.svg";
import figmaLogo from "../../assets/partners/figma.svg";
import "./LandingPage.css";

const money = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 ? "Price not listed" : Number(value) > 0 ? `PKR ${Number(value).toLocaleString("en-PK")}` : "Free";
const textValue = value => Array.isArray(value) ? value.filter(item => typeof item === "string").join(", ") : typeof value === "string" ? value : "";
const TOPICS = [
  ["Technology", Code2], ["Design", Palette], ["Business", BriefcaseBusiness], ["Science", FlaskConical],
  ["Health Sciences", HeartPulse], ["Engineering", Monitor], ["Humanities", BookOpen], ["Social Sciences", Leaf],
];
const categoryIcon = name => /design/i.test(name) ? Palette : /business|finance/i.test(name) ? BriefcaseBusiness : /health|medical/i.test(name) ? HeartPulse : /science|research/i.test(name) ? FlaskConical : /education|humanit|class/i.test(name) ? BookOpen : /personal|social/i.test(name) ? Leaf : Code2;
const dashboardFor = role => role === "Teacher" ? "/teacher/dashboard" : role === "Admin" ? "/admin/dashboard" : "/student/dashboard";
const currentSession = () => { try { const role = sessionStorage.getItem("educonnect.demoRole"), email = sessionStorage.getItem("educonnect.demoEmail"); return email && ["Student", "Teacher", "Admin"].includes(role) ? { role, email } : null; } catch { return null; } };

function Avatar({ name, source, className = "" }) {
  const [failed, setFailed] = useState(null);
  return <span className={`edc-home-avatar ${className}`}>{source && source !== failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(source)} /> : <span>{String(name || "").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || <UserRound size={24} />}</span>}</span>;
}
function Rating({ rating, count }) {
  const rated = rating !== null && rating !== undefined;
  return <span className="edc-home-rating" aria-label={rated ? `${rating.toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ""}` : "Not rated yet"}><Star size={14} fill={rated ? "currentColor" : "none"} />{rated ? <><strong>{rating.toFixed(1)}</strong>{count !== undefined && <small>({count.toLocaleString()})</small>}</> : <small>Not rated yet</small>}</span>;
}
function CourseArt({ course }) {
  const [failed, setFailed] = useState(null);
  const image = course.thumbnail || course.image, title = String(course.title).toLowerCase();
  const logo = title.includes("react") ? reactLogo : title.includes("python") ? pythonLogo : /figma|ui\/ux/.test(title) ? figmaLogo : null;
  const showImage = image && image !== failed;
  return <span className={`edc-home-course-art${showImage ? " has-image" : ""}`}>{showImage ? <img className="photo" src={image} alt="" loading="lazy" onError={() => setFailed(image)} /> : logo ? <img src={logo} alt="" /> : <GraduationCap size={44} strokeWidth={1.4} />}</span>;
}
function CourseCard({ course }) {
  const isProgram = course.kind === "program";
  const isEnrollmentSnapshot = Boolean(course.isEnrollmentSnapshot);
  const count = isProgram ? course.subjects.length : course.lessonCount;
  const hasCoverImage = Boolean(course.thumbnail || course.image);
  const cover = <><CourseArt course={course} /><h3>{course.title}</h3><span className="edc-home-cover-tag">{course.category || "Course"}</span>{!isEnrollmentSnapshot && <span className="edc-home-cover-arrow"><Play size={13} fill="currentColor" /></span>}</>;
  return <article className="edc-home-course-card">
    {isEnrollmentSnapshot
      ? <div className={`edc-home-course-cover${hasCoverImage ? " has-image" : ""}`}>{cover}</div>
      : <Link className={`edc-home-course-cover${hasCoverImage ? " has-image" : ""}`} to={landingCourseUrl(course)} state={{ from: "/" }} onClick={() => window.scrollTo({ top: 0 })}>{cover}</Link>}
    <div className="edc-home-course-body"><h3 className="edc-home-course-title global-course-title">{isEnrollmentSnapshot ? course.title : <Link to={landingCourseUrl(course)} state={{ from: "/" }}>{course.title}</Link>}</h3>
      {isProgram ? <p className="edc-home-program-subjects">{course.subjects.join(" · ")}</p> : <div className="edc-home-course-author"><Avatar name={course.instructorName} source={course.instructorProfile?.avatar} /><span>{course.instructorName || "Course instructor"}</span><Rating rating={course.rating} count={course.reviewCount} /></div>}
      <div className="edc-home-course-meta">{course.category && <span><Layers size={13} />{course.category}</span>}{course.level && <span><UserRound size={13} />{course.level}</span>}<span><BookOpen size={13} />{count} {isProgram ? "subjects" : count === 1 ? "lesson" : "lessons"}</span></div>
      <div className="edc-home-course-bottom">{!isProgram && !isEnrollmentSnapshot && <strong>{money(course.price)}</strong>}{isEnrollmentSnapshot ? <span className="global-course-history-note">In student learning history</span> : <Link className="edc-home-primary" to={landingCourseUrl(course)} state={{ from: "/" }} onClick={() => window.scrollTo({ top: 0 })}>View Course <ArrowRight size={13} /></Link>}</div>
    </div>
  </article>;
}
function TeacherCard({ teacher, onOpen }) {
  return <article className="edc-home-teacher-card"><Avatar name={teacher.name} source={teacher.profile.avatar} /><div><h3>{teacher.name}</h3><p>{textValue(teacher.profile.headline || teacher.profile.expertise || teacher.profile.qualification) || "Registered teacher"}</p><div><span><BookOpen size={13} />{teacher.courses.length} {teacher.courses.length === 1 ? "course" : "courses"}</span><Rating rating={teacher.rating} count={teacher.reviewCount} /></div></div><button type="button" aria-label={`View ${teacher.name}'s profile`} onClick={() => onOpen(teacher)}><ArrowRight size={17} /></button></article>;
}
function BookCover({ book }) {
  const [loaded, setLoaded] = useState(null), [failed, setFailed] = useState(null);
  useEffect(() => { if (!book.coverFileId) return; let disposed = false, url; loadBookFile(book.coverFileId).then(file => { if (!file) return; url = URL.createObjectURL(file); if (disposed) URL.revokeObjectURL(url); else setLoaded({ id: book.coverFileId, url }); }).catch(() => {}); return () => { disposed = true; if (url) URL.revokeObjectURL(url); }; }, [book.coverFileId]);
  const source = loaded && loaded.id === book.coverFileId ? loaded.url : book.coverImage;
  return <span className="edc-home-book-cover">{source && source !== failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(source)} /> : <BookOpen size={31} />}</span>;
}
function LandingDialog({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="edc-home-dialog" aria-labelledby="edc-home-dialog-title" onCancel={onClose}><header><h2 id="edc-home-dialog-title">{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button></header><div className="edc-home-dialog-body">{children}</div></dialog>;
}
function EmptyContent({ icon: Icon = BookOpen, title, children }) {
  return <div className="edc-home-empty"><Icon size={26} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export default function LandingPage({ page = "home", fields = [], faqs = [], onOpenCart, cartCount = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isTeachersPage = page === "teachers";
  const [catalog, setCatalog] = useState(readLandingCatalog), [session, setSession] = useState(currentSession);
  const [mobile, setMobile] = useState(false), [coursesOpen, setCoursesOpen] = useState(false), [dialog, setDialog] = useState(null);
  const [search, setSearch] = useState(""), [searchOpen, setSearchOpen] = useState(false), [activeResult, setActiveResult] = useState(-1);
  const [reviewOffset, setReviewOffset] = useState(0), [faqOpen, setFaqOpen] = useState(""), [landingFaqOpen, setLandingFaqOpen] = useState(0);
  const searchRoot = useRef(null), menuRoot = useRef(null);
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [location.hash, page]);
  useEffect(() => { const refresh = () => { setCatalog(readLandingCatalog()); setSession(currentSession()); }; const events = ["storage", "focus", "educonnect:student-header-changed", "educonnect:student-data-changed", "educonnect:teacher-courses-changed", "educonnect:teacher-profile-changed", "educonnect:books-changed", "educonnect:book-reviews-changed", "educonnect:reviews-changed", "educonnect:moderation-visibility-changed", "educonnect:admin-data-changed"]; events.forEach(event => window.addEventListener(event, refresh)); return () => events.forEach(event => window.removeEventListener(event, refresh)); }, []);
  useEffect(() => { const outside = event => { if (!searchRoot.current?.contains(event.target)) setSearchOpen(false); if (!menuRoot.current?.contains(event.target)) setCoursesOpen(false); }; const escape = event => { if (event.key === "Escape") { setCoursesOpen(false); setSearchOpen(false); setMobile(false); } }; document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape); return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); }; }, []);
  const results = searchLandingCatalog(catalog, search), suggestions = results.slice(0, 6);
  const clearMenus = () => { setMobile(false); setCoursesOpen(false); setSearchOpen(false); };
  const go = (url, state) => { clearMenus(); setDialog(null); navigate(url, state ? { state } : undefined); window.scrollTo({ top: 0 }); };
  const scrollTo = id => {
    clearMenus();
    if (isTeachersPage) {
      go(id === "home" ? "/" : `/#${id}`);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openDialog = next => { clearMenus(); setDialog(next); };
  const workspace = tab => { if (session?.role === "Student") go("/student/dashboard", { studentTab: tab }); else go("/login", { studentTab: tab }); };
  const signup = role => go("/signup", { role });
  const chooseResult = item => item.kind === "course" ? go(landingCourseUrl(item.record), { from: "/" }) : openDialog({ kind: item.kind, id: item.kind === "teacher" ? item.record.email : item.record.id });
  const submitSearch = event => { event.preventDefault(); if (!search.trim()) go(landingCatalogUrl()); else if (activeResult >= 0 && suggestions[activeResult]) chooseResult(suggestions[activeResult]); else openDialog({ kind: "search", query: search.trim() }); };
  const categories = [...catalog.categories];
  TOPICS.forEach(([name]) => { if (!categories.some(item => item.name.toLowerCase() === name.toLowerCase())) categories.push({ name, count: 0 }); });
  const visibleCategories = categories.slice(0, 8);
  const featuredCourses = featuredLandingCourses(catalog, catalog.courses.length + 3);
  const footerSubjectGroups = [
    { title: "Education Levels", links: [
      { name: "School Classes", to: "/courses" },
      { name: "College Programs", to: landingCatalogUrl("", "College") },
      { name: "Undergraduate Studies", to: landingCatalogUrl("", "Undergraduate") },
      { name: "Postgraduate Studies", to: landingCatalogUrl("", "Postgraduate") },
      { name: "Doctoral Studies", to: landingCatalogUrl("", "Doctoral") },
    ] },
    { title: "Technology", links: fields.filter(field => field.category === "Technology").slice(0, 5).map(field => ({ name: field.name, to: landingCatalogUrl(field.name) })) },
    { title: "Science & Health", links: fields.filter(field => /science|health|engineering/i.test(field.category)).slice(0, 5).map(field => ({ name: field.name, to: landingCatalogUrl(field.name) })) },
    { title: "Business & Humanities", links: fields.filter(field => /business|humanities|design|social/i.test(field.category)).slice(0, 5).map(field => ({ name: field.name, to: landingCatalogUrl(field.name) })) },
  ].filter(group => group.links.length);
  const visibleReviews = Array.from({ length: Math.min(3, catalog.reviews.length) }, (_, index) => catalog.reviews[(reviewOffset + index) % catalog.reviews.length]);
  const teacher = dialog?.kind === "teacher" ? catalog.teachers.find(item => item.email === dialog.id) : null;
  const book = dialog?.kind === "book" ? catalog.books.find(item => String(item.id) === String(dialog.id)) : null;
  const dialogTitle = dialog?.kind === "teacher" ? "Teacher Profile" : dialog?.kind === "book" ? "Book Details" : dialog?.kind === "books" ? "Books & Learning Resources" : dialog?.kind === "categories" ? "Explore Study Fields" : dialog?.kind === "faqs" ? "Frequently Asked Questions" : "Search Results";
  const features = [
    { title: "Multiple Education Levels", description: "Explore school, college and university.", icon: Layers },
    { title: "Different Study Fields", description: "Technology, science, business and more.", icon: Zap },
    { title: "Organized Courses", description: "Find subjects and learning topics.", icon: BookOpen },
    { title: "Learn at Your Own Pace", description: "Explore learning resources anytime.", icon: GraduationCap },
  ];
  const resultRows = items => items.length ? <div className="edc-home-result-list">{items.map(item => { const Icon = item.kind === "teacher" ? UserRound : item.kind === "book" ? BookOpen : GraduationCap; return <button type="button" key={`${item.kind}-${item.key}`} onClick={() => chooseResult(item)}><span><Icon size={20} /></span><span><strong>{item.title}</strong><small>{textValue(item.detail)} · {item.kind === "teacher" ? "Teacher" : item.kind === "book" ? "Book" : "Course"}</small></span><ArrowUpRight size={17} /></button>; })}</div> : <EmptyContent icon={Search} title="No published results found">Try another course, book, teacher name or subject.</EmptyContent>;

  return <div className="edc-landing"><a className="edc-home-skip" href="#edc-home-main">Skip to content</a><header className="edc-home-header"><div className="edc-home-header-inner"><button type="button" className="edc-home-brand" aria-label="EduConnect AI home" onClick={() => scrollTo("home")}><GraduationCap size={35} fill="currentColor" /><span>EduConnect <b>AI</b></span></button><button type="button" className="edc-home-mobile-toggle" aria-label="Toggle navigation" aria-expanded={mobile} aria-controls="edc-home-navigation" onClick={() => setMobile(value => !value)}>{mobile ? <X size={22} /> : <Menu size={22} />}</button><nav id="edc-home-navigation" className={mobile ? "open" : ""} aria-label="Main navigation"><button type="button" className={isTeachersPage ? "" : "active"} onClick={() => scrollTo("home")}>Home</button><div className="edc-home-menu" ref={menuRoot}><button type="button" aria-expanded={coursesOpen} aria-controls="edc-home-course-menu" onClick={() => setCoursesOpen(value => !value)}>Courses <ChevronDown size={13} /></button>{coursesOpen && <div id="edc-home-course-menu"><Link to="/courses" onClick={clearMenus}><BookOpen size={16} /><span>All Learning Programs<small>School to PhD and professional courses</small></span><ArrowRight size={14} /></Link><Link to="/technology" onClick={clearMenus}><Code2 size={16} /><span>Technology<small>Academic and professional subjects</small></span><ArrowRight size={14} /></Link><div className="edc-home-school-menu"><strong>School Classes</strong><div>{Array.from({ length: 12 }, (_, index) => <Link key={index} to={`/classes/class-${index + 1}`} onClick={clearMenus}>Class {index + 1}</Link>)}</div></div>{[["College", "College Programs"], ["Undergraduate", "Undergraduate Studies"], ["Postgraduate", "Postgraduate Studies"], ["Doctoral", "Doctoral Studies"]].map(([category, label]) => <Link key={category} to={landingCatalogUrl("", category)} onClick={clearMenus}><GraduationCap size={15} /><span>{label}</span><ArrowRight size={13} /></Link>)}</div>}</div><button type="button" onClick={() => openDialog({ kind: "books" })}>Books</button><Link to="/teachers" className={`edc-home-nav-link${isTeachersPage ? " active" : ""}`} aria-current={isTeachersPage ? "page" : undefined} onClick={() => { clearMenus(); window.scrollTo({ top: 0 }); }}>Teachers</Link><button type="button" onClick={() => workspace("learning-paths")}>Learning Paths</button>{!session && <Link className="edc-home-mobile-login" to="/login" onClick={clearMenus}>Log In</Link>}</nav><form className="edc-home-header-search" role="search" ref={searchRoot} onSubmit={submitSearch}><Search size={16} /><input role="combobox" aria-label="Search courses, books and teachers" aria-expanded={searchOpen && !!search.trim()} aria-controls="edc-home-suggestions" aria-autocomplete="list" aria-activedescendant={searchOpen && activeResult >= 0 ? `edc-home-suggestion-${activeResult}` : undefined} placeholder="Search courses, books, teachers..." value={search} onFocus={() => setSearchOpen(true)} onChange={event => { setSearch(event.target.value); setSearchOpen(true); setActiveResult(-1); }} onKeyDown={event => { if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setSearchOpen(true); setActiveResult(previous => (previous + 1) % suggestions.length); } else if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setActiveResult(previous => (previous - 1 + suggestions.length) % suggestions.length); } }} /><button type="submit" aria-label="Search"><ArrowRight size={15} /></button>{searchOpen && search.trim() && <div className="edc-home-search-popover" id="edc-home-suggestions" role="listbox" aria-label="Published search results">{suggestions.length ? suggestions.map((item, index) => <button type="button" id={`edc-home-suggestion-${index}`} key={`${item.kind}-${item.key}`} role="option" aria-selected={index === activeResult} onClick={() => chooseResult(item)}><span><strong>{item.title}</strong><small>{item.kind === "teacher" ? "Teacher" : item.kind === "book" ? "Book" : "Course"} · {textValue(item.detail)}</small></span><ArrowUpRight size={15} /></button>) : <p>No published results found.</p>}<button type="button" className="edc-home-search-all" onClick={() => openDialog({ kind: "search", query: search.trim() })}>View all search results <ArrowRight size={14} /></button></div>}</form><div className="edc-home-header-actions"><button type="button" className="edc-home-cart" aria-label={`My cart, ${cartCount} items`} title={`My Cart (${cartCount})`} onClick={onOpenCart}><ShoppingCart size={19} />{cartCount > 0 && <span>{cartCount}</span>}</button>{session ? <button type="button" className="edc-home-primary" onClick={() => go(dashboardFor(session.role))}>Dashboard <ArrowUpRight size={13} /></button> : <><Link to="/login" className="edc-home-login">Log In</Link><Link to="/signup" state={{ role: "Student" }} className="edc-home-primary">Sign Up</Link></>}</div></div></header>

    <main id="edc-home-main">{isTeachersPage ? <div className="edc-home-wrap edc-teachers-page">
      <nav className="edc-teachers-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><ChevronRight size={13} /><span aria-current="page">Teachers</span></nav>
      <header className="edc-teachers-heading"><h1>Our Teachers</h1><p>Browse teacher profiles, published courses and student ratings.</p></header>
      {catalog.teachers.length ? <div className="edc-home-teacher-grid">{catalog.teachers.map(item => <TeacherCard key={item.email} teacher={item} onOpen={record => openDialog({ kind: "teacher", id: record.email })} />)}</div> : <EmptyContent icon={UserRound} title="No teacher profiles available yet">Saved teacher profiles will appear here.</EmptyContent>}
    </div> : <><section className="edc-home-hero" id="home">
      <div className="edc-home-wrap edc-home-hero-inner">
        <div className="edc-home-hero-copy">
          <span className="edc-home-pill"><Sparkles size={15} />Your All-in-One Learning Platform</span>
          <h1>Learn, Study & Grow<br />with <span>EduConnect AI</span></h1>
          <p>Explore school education, university degrees, research subjects and professional learning in one platform.</p>
          <div><Link className="edc-home-primary" to="/courses">Explore Courses <ArrowRight size={17} /></Link><button type="button" className="edc-home-hero-teacher" onClick={() => signup("Teacher")}>Become a Teacher</button></div>
          <dl className="edc-home-hero-stats">
            <div><BookOpen size={25} /><dt>{catalog.programs.length + catalog.courses.length}+</dt><dd>Learning programs</dd></div>
            <div><GraduationCap size={28} /><dt>Class 1?12</dt><dd>School education</dd></div>
            <div><Globe size={24} /><dt>{fields.length}+</dt><dd>Study fields</dd></div>
            <div><Zap size={25} /><dt>Your pace</dt><dd>Your learning</dd></div>
          </dl>
        </div>
        <div className="edc-home-hero-visual">
          <div className="edc-home-photo-halo" />
          <div className="edc-home-photo-frame"><img src={heroPhoto} width="1440" height="960" alt="Student wearing headphones and concentrating on a laptop" fetchPriority="high" /></div>
          <div className="edc-home-hero-checklist">{["School to PhD", "Academic Subjects", "Professional Skills", "Study Tools"].map(label => <span key={label}><span><Check size={13} strokeWidth={3} /></span>{label}</span>)}</div>
          <Link className="edc-home-hero-explore" to="/courses" aria-label="Explore learning programs"><Play size={25} fill="currentColor" /></Link>
        </div>
      </div>
      <svg className="edc-home-hero-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 15C240 100 420 5 720 35S1170 95 1440 25V90H0Z" fill="#b5a0e0" opacity=".4" /><path d="M0 48C280 105 450 44 720 60S1200 100 1440 50V90H0Z" fill="#f8f7fd" /></svg>
    </section>

    <div className="edc-home-wrap edc-home-content">
      <section className="edc-home-tool-strip" aria-label="Your learning workspace">
        {[
          { title: "Books & Teachers", description: "Find books and explore expert teachers", icon: BookOpen, action: () => openDialog({ kind: "books" }) },
          { title: "Study Planner", description: "Plan, organize and stay on track", icon: CalendarDays, tab: "planner" },
          { title: "Assignments & Grades", description: "Submit work and follow your progress", icon: ClipboardList, tab: "course-assignments" },
          { title: "Topic Mastery", description: "Build your skills, one topic at a time", icon: Target, tab: "mastery" },
          { title: "Learning Paths", description: "Follow your own learning journey", icon: Route, tab: "learning-paths" },
          { title: "Research Workspace", description: "Bring your ideas and research together", icon: FlaskConical, tab: "research" },
        ].map(({ title, description, icon: Icon, action, tab }) => <button type="button" key={title} onClick={action || (() => workspace(tab))}><Icon size={31} strokeWidth={1.7} /><h2>{title}</h2><p>{description}</p></button>)}
      </section>
      <section id="courses" className="edc-home-section"><header className="edc-home-section-heading"><h2>Published &amp; Enrolled Courses</h2><Link to="/courses">View All Courses <ArrowRight size={17} /></Link></header>{featuredCourses.length ? <div className="edc-home-course-grid">{featuredCourses.map(course => <CourseCard key={course.key} course={course} />)}</div> : <EmptyContent title="No courses available yet">Courses will appear here when teachers publish them or students enroll.</EmptyContent>}</section>

    <section id="fields" className="edc-home-section"><header className="edc-home-section-heading"><h2>Popular Study Fields</h2><button type="button" onClick={() => openDialog({ kind: "categories" })}>View All Categories <ArrowRight size={17} /></button></header><div className="edc-home-category-grid">{visibleCategories.map(category => { const Icon = categoryIcon(category.name); return <Link key={category.name} to={landingCatalogUrl("", category.name)}><Icon size={30} strokeWidth={1.8} /><h3>{category.name}</h3><span>{category.count ? `${category.count} ${category.count === 1 ? "course" : "courses"}` : "Explore subjects"}</span></Link>; })}</div><StudyPartners className="edc-home-study-partners" /></section>

    <section id="teachers" className="edc-home-section"><header className="edc-home-section-heading"><h2>Our Teachers</h2><Link to="/teachers" onClick={() => window.scrollTo({ top: 0 })}>View All Instructors <ArrowRight size={17} /></Link></header>{catalog.teachers.length ? <div className="edc-home-teacher-grid">{catalog.teachers.map(item => <TeacherCard key={item.email} teacher={item} onOpen={record => openDialog({ kind: "teacher", id: record.email })} />)}</div> : <EmptyContent icon={UserRound} title="No teacher profiles available yet">Saved teacher profiles will appear here.</EmptyContent>}</section>

    <section id="about" className="edc-home-section"><header className="edc-home-section-heading"><h2>Why EduConnect AI?</h2></header><div className="edc-home-why-layout"><div className="edc-home-why-visual"><img src={learningArtwork} alt="Books and a graduation cap representing learning at different education levels." loading="lazy" /></div><div className="edc-home-why-features">{features.map(({ title, description, icon: Icon }) => <article key={title}><span><Icon size={23} strokeWidth={1.8} /></span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div></div></section>

    <section className="edc-home-section"><header className="edc-home-section-heading"><h2>What Our Students Say</h2><div className="edc-home-review-arrows"><button type="button" aria-label="Previous student reviews" disabled={catalog.reviews.length <= 3} onClick={() => setReviewOffset(previous => (previous - 1 + catalog.reviews.length) % catalog.reviews.length)}><ChevronLeft size={19} /></button><button type="button" aria-label="Next student reviews" disabled={catalog.reviews.length <= 3} onClick={() => setReviewOffset(previous => (previous + 1) % catalog.reviews.length)}><ChevronRight size={19} /></button></div></header>{visibleReviews.length ? <div className="edc-home-review-grid">{visibleReviews.map(review => <article key={review.id || `${review.courseKey}:${review.studentEmail}`}><Avatar name={review.studentName || "Student"} source={review.studentAvatar} /><div><h3>{review.studentName || "Student"}</h3><div className="edc-home-review-stars" aria-label={`${review.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map(value => <Star key={value} size={14} fill={value <= Number(review.rating) ? "currentColor" : "none"} />)}</div><p>“{review.comment}”</p><Link to={landingCourseUrl(review.course)} state={{ from: "/" }}>{review.course.title}</Link></div><Quote className="edc-home-quote" size={24} /></article>)}</div> : <EmptyContent icon={Quote} title="No course reviews yet">Published student reviews will appear here after learners share their feedback.</EmptyContent>}</section>

    <section id="faqs" className="edc-home-section edc-home-faq-section">
      <header className="edc-home-faq-heading"><span>NEED HELP?</span><h2>Frequently Asked <strong>Questions</strong></h2><p>Answers to help you get started with EduConnect AI.</p></header>
      {faqs.length ? <div className="edc-home-faqs">
        {faqs.slice(0, 5).map((faq, index) => <article key={faq.id || index}>
          <h3><button type="button" aria-expanded={landingFaqOpen === index} aria-controls={`edc-home-faq-answer-${index}`} onClick={() => setLandingFaqOpen(current => current === index ? -1 : index)}>{faq.question}<ChevronDown size={18} /></button></h3>
          <p id={`edc-home-faq-answer-${index}`} hidden={landingFaqOpen !== index}>{faq.answer}</p>
        </article>)}
        <button type="button" className="edc-home-faq-all" onClick={() => openDialog({ kind: "faqs" })}>View all FAQs <ArrowRight size={15} /></button>
      </div> : <EmptyContent title="No FAQs have been published yet">Help articles will appear here when they are published.</EmptyContent>}
    </section>

    <section className="edc-home-cta" id="signup"><span><GraduationCap size={52} strokeWidth={1.3} /></span><div><h2>Start Your Learning Journey Today!</h2><p>From school lessons to advanced research, explore subjects and learning opportunities.</p><div className="edc-home-cta-benefits">{["School to PhD", "Academic Subjects", "Professional Skills"].map(label => <span key={label}><Check size={12} />{label}</span>)}</div></div><Link to="/courses" className="edc-home-primary">Explore Learning <ArrowRight size={16} /></Link><button type="button" className="edc-home-hero-teacher" onClick={() => signup("Teacher")}>Become a Teacher</button></section></div></>}</main>

    <footer className="edc-home-footer">
      <div className="edc-home-wrap">
        <div className="edc-home-footer-explore">
          <div className="edc-home-footer-partners">
            <p>Explore school subjects, university programs and career skills with tools and learning platforms.</p>
            <div role="list" aria-label="Learning and technology platform logos">
              {STUDY_PARTNERS.filter(partner => ["Coursera", "GitHub", "Google Scholar"].includes(partner.name)).map(partner => <span key={partner.name} role="listitem" title={partner.name}><img src={partner.logo} alt={partner.name} loading="lazy" /></span>)}
            </div>
          </div>
          <h3>Explore popular subjects and learning areas</h3>
          <div className="edc-home-footer-subjects">
            {footerSubjectGroups.map(group => <div key={group.title}><h4>{group.title}</h4>{group.links.map(field => <Link key={field.name} to={field.to}>{field.name}</Link>)}</div>)}
          </div>
        </div>
        <div className="edc-home-footer-grid">
          <div>
            <button type="button" className="edc-home-brand" onClick={() => scrollTo("home")}><GraduationCap size={34} fill="currentColor" /><span>EduConnect <b>AI</b></span></button>
            <p>A learning platform for school, university, research and professional education.</p>
            
            <button type="button" className="edc-home-primary" onClick={() => signup("Student")}>Create Free Account <ArrowRight size={14} /></button>
          </div>
          <div>
            <h3>Explore</h3>
            <Link to="/courses">All Courses</Link>
            <button type="button" onClick={() => openDialog({ kind: "books" })}>Books</button>
            <Link to="/teachers" onClick={() => window.scrollTo({ top: 0 })}>Teachers</Link>
            <button type="button" onClick={() => workspace("learning-paths")}>Learning Paths</button>
          </div>
          <div>
            <h3>Study Fields</h3>
            {catalog.categories.slice(0, 5).map(category => <Link key={category.name} to={landingCatalogUrl("", category.name)}>{category.name}</Link>)}
            {!catalog.categories.length && <Link to="/courses">Browse courses</Link>}
          </div>
          <div>
            <h3>Learning</h3>
            <button type="button" onClick={() => workspace("planner")}>Study Planner</button>
            <button type="button" onClick={() => workspace("course-assignments")}>Course Assignments</button>
            <button type="button" onClick={() => workspace("mastery")}>Topic Mastery</button>
            <button type="button" onClick={() => workspace("research")}>Research Workspace</button>
          </div>
          <div>
            <h3>Contact</h3>
            <a href="mailto:hello@educonnect.ai"><Mail size={14} />hello@educonnect.ai</a>
            <button type="button" onClick={() => workspace("help-support")}><LifeBuoy size={14} />Contact support</button>
            <button type="button" onClick={() => openDialog({ kind: "faqs" })}>FAQs</button>
            <button type="button" onClick={() => workspace("appeals")}>Moderation & Appeals</button>
            <span className="edc-home-footer-platform"><Globe size={14} />Online learning platform</span>
          </div>
        </div>
        <div className="edc-home-footer-bottom"><span>© {new Date().getFullYear()} EduConnect AI. All rights reserved.</span><span>Made for curious minds <Sparkles size={13} /></span></div>
      </div>
    </footer>

    {dialog && <LandingDialog title={dialogTitle} onClose={() => setDialog(null)}>
      {dialog.kind === "search" && <><p className="edc-home-dialog-intro">Results for “{dialog.query}”</p>{resultRows(searchLandingCatalog(catalog, dialog.query))}<Link className="edc-home-secondary" to={landingCatalogUrl(dialog.query)}>Browse Course Catalog <ArrowRight size={14} /></Link></>}
      {dialog.kind === "books" && (catalog.books.length ? <div className="edc-home-books-grid">{catalog.books.map(item => <button type="button" key={item.id} onClick={() => setDialog({ kind: "book", id: item.id })}><BookCover book={item} /><span><strong>{item.title}</strong><small>{item.author || item.teacherName || item.subject}</small><b>{item.isFree ? "Free" : money(item.price)}</b></span><ArrowUpRight size={17} /></button>)}</div> : <EmptyContent title="No approved books available yet">Books will appear here after they are approved for publication.</EmptyContent>)}
      {dialog.kind === "teacher" && (teacher ? <div className="edc-home-teacher-details"><button type="button" className="edc-home-dialog-back" onClick={() => go("/teachers")}><ArrowLeft size={14} />All Teachers</button><div><Avatar name={teacher.name} source={teacher.profile.avatar} /><span><h3>{teacher.name}</h3><p>{textValue(teacher.profile.headline || teacher.profile.expertise || teacher.profile.qualification)}</p><Rating rating={teacher.rating} count={teacher.reviewCount} /></span></div>{teacher.profile.bio && <p>{teacher.profile.bio}</p>}{teacher.profile.qualification && <p><strong>Qualification:</strong> {teacher.profile.qualification}</p>}<h3>Published Courses ({teacher.courses.length})</h3>{teacher.courses.length ? <div className="edc-home-teacher-courses">{teacher.courses.map(course => <Link key={course.key} to={landingCourseUrl(course)} state={{ from: "/" }}><BookOpen size={17} /><span>{course.title}</span><ArrowUpRight size={16} /></Link>)}</div> : <p>This teacher has not published a course yet.</p>}</div> : <EmptyContent icon={UserRound} title="This profile is no longer available" />)}
      {dialog.kind === "book" && (book ? <div className="edc-home-book-details"><button type="button" className="edc-home-dialog-back" onClick={() => setDialog({ kind: "books" })}><ArrowLeft size={14} />All Books</button><div><BookCover book={book} /><span><h3>{book.title}</h3>{(book.author || book.teacherName) && <p>{book.author || book.teacherName}</p>}{book.subject && <p>{book.subject}</p>}<strong>{book.isFree ? "Free" : money(book.price)}</strong></span></div>{book.description && <p>{book.description}</p>}<button type="button" className="edc-home-primary" onClick={() => workspace("books")}><BookOpen size={16} />{session?.role === "Student" ? "Open in Books & Teachers" : "Log in to Access Books"}</button></div> : <EmptyContent title="This book is no longer available" />)}
      {dialog.kind === "categories" && <div className="edc-home-fields-list">{fields.map(field => { const Icon = field.icon || BookOpen; return <Link key={field.name} to={landingCatalogUrl(field.name)}><Icon size={22} /><span><strong>{field.name}</strong><small>{field.category}</small></span><ArrowRight size={14} /></Link>; })}</div>}
      {dialog.kind === "faqs" && (faqs.length ? <div className="edc-home-faqs">{faqs.map((faq, index) => <article key={faq.id || index}><h3><button type="button" aria-expanded={faqOpen === (faq.id || index)} onClick={() => setFaqOpen(faqOpen === (faq.id || index) ? "" : faq.id || index)}>{faq.question}<ChevronDown size={17} /></button></h3>{faqOpen === (faq.id || index) && <p>{faq.answer}</p>}</article>)}</div> : <EmptyContent title="No FAQs have been published yet" />)}
    </LandingDialog>}
  </div>;
}
