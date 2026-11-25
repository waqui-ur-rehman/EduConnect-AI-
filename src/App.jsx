import DemoAdminSetup from "./components/admin/AdminDemoSetup";
import { useEffect, useMemo, useRef, useState } from "react";
import useContentSync from "./utils/useContentSync";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  ShoppingCart,
  Star,
  Users,
  BookOpen,
  GraduationCap,
  PlayCircle,
  CheckCircle2,
  Quote,
  Mail,
  Phone,
  Globe,
  Sparkles,
  Award,
  School,
  Calculator,
  FlaskConical,
  Languages,
  Monitor,
  BriefcaseBusiness,
  Brain,
  Microscope,
  Palette,
  Scale,
  HeartPulse,
  Landmark,
  Code,
  Database,
  Cloud,
  BookMarked
} from "lucide-react";

import ExploreCourses from "./pages/ExploreCourses";
import PublishedCourses from "./components/Marketplace/PublishedCourses";
import SignupPage from "./pages/SignupPage";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import CartPage from "./components/Marketplace/CartPage";
import PaymentReturnPage from "./components/Marketplace/PaymentReturnPage";
import ResilientImage from "./components/ResilientImage";
import { ADMIN_DATA_CHANGED_EVENT, getAdminHelpFaqs } from "./components/admin/adminData";
import { getCart, getStudentEmail } from "./utils/studentCart";
import "./index.css";
import LandingPage from "./components/landing/LandingPage";
import StudyPartners from "./components/landing/StudyPartners";
import { STUDY_PARTNERS } from "./components/landing/studyPartnerData";

const categories = Array.from({ length: 12 }, (_, index) => ({
  name: `Class ${index + 1}`,
  icon: School,
  count: "School Education",
  color: ["purple", "pink", "orange", "blue", "green", "yellow"][index % 6]
}));

const professionalFields = [
  { name: "Computer Science", icon: Monitor, category: "Technology" },
  { name: "Artificial Intelligence", icon: Brain, category: "Technology" },
  { name: "Machine Learning", icon: Brain, category: "Technology" },
  { name: "Web Development", icon: Code, category: "Technology" },
  { name: "Data Science", icon: Database, category: "Technology" },
  { name: "Cyber Security", icon: Monitor, category: "Technology" },
  { name: "Cloud Computing", icon: Cloud, category: "Technology" },
  { name: "Engineering", icon: Calculator, category: "Engineering" },
  { name: "Medical Sciences", icon: HeartPulse, category: "Health Sciences" },
  { name: "Physics", icon: FlaskConical, category: "Science" },
  { name: "Chemistry", icon: FlaskConical, category: "Science" },
  { name: "Biology", icon: Microscope, category: "Science" },
  { name: "Mathematics", icon: Calculator, category: "Science" },
  { name: "Business Administration", icon: BriefcaseBusiness, category: "Business" },
  { name: "Accounting and Finance", icon: Landmark, category: "Business" },
  { name: "Economics", icon: Landmark, category: "Business" },
  { name: "Graphic Design", icon: Palette, category: "Design" },
  { name: "UI/UX Design", icon: Palette, category: "Design" },
  { name: "Law", icon: Scale, category: "Humanities" },
  { name: "English Literature", icon: Languages, category: "Humanities" },
  { name: "Psychology", icon: Brain, category: "Social Sciences" },
  { name: "Education", icon: BookMarked, category: "Humanities" }
];

const routeCategories = [
  "Technology",
  "Design",
  "Business",
  "Science",
  "Health Sciences",
  "Engineering",
  "Humanities",
  "Research",
  "College",
  "Undergraduate",
  "Postgraduate",
  "Doctoral",
  "Social Sciences"
];

const slugifyRouteSegment = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const titleFromRouteSegment = (value) =>
  decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

// Converts clean course URLs and legacy query URLs into the active search filters.
const getExploreRouteState = (pathname, queryString) => {
  const searchParams = new URLSearchParams(queryString);
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "courses") {
    return {
      search: searchParams.get("search") ?? "",
      category: searchParams.get("category") ?? "All"
    };
  }

  if (segments[0] === "classes" && segments[1]) {
    const classMatch = decodeURIComponent(segments[1]).match(/^class-?(\d+)$/i);
    return {
      search: "",
      category: classMatch
        ? `Class ${classMatch[1]}`
        : `Class ${titleFromRouteSegment(segments[1])}`
    };
  }

  if (segments[0] === "subject") {
    return segments[1]
      ? { search: titleFromRouteSegment(segments[1]), category: "All" }
      : { search: "", category: "subject" };
  }

  const category = routeCategories.find(
    (item) => slugifyRouteSegment(item) === segments[0]
  );
  if (category) {
    return {
      search: segments[1] ? titleFromRouteSegment(segments.slice(1).join("-")) : "",
      category
    };
  }

  return segments.length
    ? { search: titleFromRouteSegment(segments.join("-")), category: "All" }
    : { search: "", category: "All" };
};

const popularSkillGroups = [
  {
    name: "Technology",
    skills: ["Computer Science", "Machine Learning", "Web Development", "Data Science", "Cyber Security", "Cloud Computing"]
  },
  {
    name: "Science & Engineering",
    skills: ["Engineering", "Medical Sciences", "Physics", "Chemistry", "Biology", "Mathematics"]
  },
  {
    name: "Business & Creativity",
    skills: ["Business Administration", "Accounting and Finance", "Economics", "Graphic Design", "UI/UX Design", "Law", "English Literature", "Psychology", "Education"]
  }
];

const classImages = [
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800",
  "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=800",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800",
  "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=800",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800"
];

const schoolSubjects = {
  1: ["English", "Urdu", "Mathematics", "General Knowledge"],
  2: ["English", "Urdu", "Mathematics", "General Knowledge"],
  3: ["English", "Urdu", "Mathematics", "General Science"],
  4: ["English", "Urdu", "Mathematics", "General Science"],
  5: ["English", "Urdu", "Mathematics", "General Science"],
  6: ["English", "Urdu", "Mathematics", "Science", "Computer"],
  7: ["English", "Urdu", "Mathematics", "Science", "Computer"],
  8: ["English", "Urdu", "Mathematics", "Science", "Computer"],
  9: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"],
  10: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"],
  11: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"],
  12: ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Computer"]
};

const courses = categories.map((category, index) => ({
  id: index + 1,
  title: `Class ${index + 1} Complete Study Program`,
  category: category.name,
  level:
    index < 5
      ? "Primary"
      : index < 8
        ? "Middle"
        : index < 10
          ? "Secondary"
          : "Higher Secondary",
  duration: "Self-paced",
  lessons: schoolSubjects[index + 1].length * 4,
  rating: 5,
  students: 1000 + index * 150,
  price: "Free",
  instructor: "EduConnect Learning Library",
  image: classImages[index],
  tag: "Study Program",
  description: `Explore Class ${index + 1} subjects, study topics and video learning resources.`
}));

const instructors = [
  {
    name: "English Learning",
    role: "Language and Literature",
    students: "Multiple Levels",
    courses: 12,
    image: "https://i.pravatar.cc/300?img=47",
    cover: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800",
    expertise: "Grammar, reading and academic writing"
  },
  {
    name: "Mathematics Learning",
    role: "Mathematics",
    students: "School to University",
    courses: 12,
    image: "https://i.pravatar.cc/300?img=12",
    cover: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800",
    expertise: "Mathematics and problem solving"
  },
  {
    name: "Science Learning",
    role: "Science Subjects",
    students: "School to University",
    courses: 10,
    image: "https://i.pravatar.cc/300?img=13",
    cover: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=800",
    expertise: "Physics, Chemistry and Biology"
  },
  {
    name: "Technology Learning",
    role: "Computer Science",
    students: "All Levels",
    courses: 15,
    image: "https://i.pravatar.cc/300?img=44",
    cover: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800",
    expertise: "Programming, AI and modern technology"
  }
];

const testimonials = [
  {
    name: "School Learner",
    role: "School Education",
    text: "I can explore different school subjects and find useful learning material in one place. Clear class categories make it easier to choose what to study next and keep learning at my own pace.",
    image: "https://i.pravatar.cc/100?img=11",
    initials: "SL",
    action: "Explore school classes",
    category: "Class 1"
  },
  {
    name: "University Learner",
    role: "University Education",
    text: "The organized learning categories make it easier to find subjects for my studies. I can browse different programs, review useful topics, and discover learning resources that support my academic goals.",
    image: "https://i.pravatar.cc/100?img=45",
    initials: "UL",
    action: "Explore all courses",
    category: "All"
  },
  {
    name: "Technology Learner",
    role: "Professional Learning",
    text: "I can explore technology, science, and professional learning topics in one place. The subject areas help me discover new skills, review key concepts, and find a good direction for continued learning.",
    image: "https://i.pravatar.cc/100?img=15",
    initials: "TL",
    action: "Explore technology",
    category: "Technology"
  }
];

function App() {
  useContentSync();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = location.pathname === "/" ? "home" : "courses";
  const routeParts = location.pathname.split("/").filter(Boolean);
  const courseRoute = routeParts[0] === "course" && routeParts.length >= 3
    ? {
        teacherEmail: decodeURIComponent(routeParts[1]),
        id: decodeURIComponent(routeParts.slice(2).join("/")),
      }
    : null;
  const paymentReturn = routeParts[0] === "payment" && routeParts[1] === "return";
  const exploreRouteState = getExploreRouteState(location.pathname, location.search);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [openMenu, setOpenMenu] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [modal, setModal] = useState("");
  const [faqOpen, setFaqOpen] = useState(0);
  const trendingCoursesRef = useRef(null);
  const studyFieldsRef = useRef(null);
  const [canScrollTrendingBack, setCanScrollTrendingBack] = useState(false);
  const [canScrollTrendingForward, setCanScrollTrendingForward] = useState(true);
  const [canScrollFieldsBack, setCanScrollFieldsBack] = useState(false);
  const [canScrollFieldsForward, setCanScrollFieldsForward] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showGlobalCart, setShowGlobalCart] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [helpFaqs, setHelpFaqs] = useState(() => getAdminHelpFaqs({ publishedOnly: true }));

  useEffect(() => {
    let cancelled = false;
    const refreshCart = () => {
      const email = getStudentEmail();
      if (!email) { setCartCount(0); return; }
      getCart().then((items) => { if (!cancelled) setCartCount(items.length); }).catch(() => {});
    };

    refreshCart();
    window.addEventListener("storage", refreshCart);
    window.addEventListener("focus", refreshCart);
    window.addEventListener("educonnect:cart-changed", refreshCart);
    window.addEventListener("educonnect:student-data-changed", refreshCart);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", refreshCart);
      window.removeEventListener("focus", refreshCart);
      window.removeEventListener("educonnect:cart-changed", refreshCart);
      window.removeEventListener("educonnect:student-data-changed", refreshCart);
    };
  }, [location.pathname]);

  useEffect(() => {
    setShowGlobalCart(false);
  }, [location.pathname]);

  // Shows the back-to-top control only after the visitor scrolls down.
  useEffect(() => {
    const updateScrollTopVisibility = () => {
      setShowScrollTop(window.scrollY > 300);
    };

    updateScrollTopVisibility();
    window.addEventListener("scroll", updateScrollTopVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateScrollTopVisibility);
    };
  }, []);

  useEffect(() => {
    const refreshFaqs = () => setHelpFaqs(getAdminHelpFaqs({ publishedOnly: true }));
    window.addEventListener("storage", refreshFaqs);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshFaqs);
    return () => {
      window.removeEventListener("storage", refreshFaqs);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshFaqs);
    };
  }, []);

  useEffect(() => {
    const carousel = trendingCoursesRef.current;
    if (!carousel) return undefined;

    const updateScrollButtons = () => {
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      setCanScrollTrendingBack(carousel.scrollLeft > 1);
      setCanScrollTrendingForward(maxScroll - carousel.scrollLeft > 1);
    };

    const initialUpdate = window.requestAnimationFrame(updateScrollButtons);
    carousel.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);
    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(carousel);

    return () => {
      window.cancelAnimationFrame(initialUpdate);
      carousel.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const carousel = studyFieldsRef.current;
    if (!carousel) return undefined;

    const updateScrollButtons = () => {
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      setCanScrollFieldsBack(carousel.scrollLeft > 1);
      setCanScrollFieldsForward(maxScroll - carousel.scrollLeft > 1);
    };

    const initialUpdate = window.requestAnimationFrame(updateScrollButtons);
    carousel.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);
    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(carousel);

    return () => {
      window.cancelAnimationFrame(initialUpdate);
      carousel.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!location.state?.openLogin) return;
    setModal("login");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesCategory =
        selectedCategory === "All" || course.category === selectedCategory;

      const searchText = search.toLowerCase().trim();

      const matchesSearch =
        course.title.toLowerCase().includes(searchText) ||
        course.category.toLowerCase().includes(searchText) ||
        course.description.toLowerCase().includes(searchText);

      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory]);

  const closeMenus = () => {
    setOpenMenu("");
    setMobileOpen(false);
  };

  const openGlobalCart = () => {
    closeMenus();
    if (!getStudentEmail()) {
      navigate("/login");
      return;
    }
    setShowGlobalCart(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleMenu = (menu) => {
    setOpenMenu((current) => current === menu ? "" : menu);
  };

  const goTo = (id) => {
    closeMenus();

    if (currentPage !== "home") {
      navigate("/");
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return;
    }

    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  // Opens course results at a readable route while preserving the selected filters.
  const openExploreCourses = (newSearch = search, newCategory = selectedCategory) => {
    closeMenus();
    setSearch(newSearch);
    setSelectedCategory(newCategory);
    const categorySlug = slugifyRouteSegment(newCategory);
    const searchSlug = slugifyRouteSegment(newSearch);
    const classMatch = newCategory.match(/^Class\s+(\d+)$/i);
    let route = "/courses";

    if (classMatch) {
      route = `/classes/class-${classMatch[1]}`;
    } else if (newCategory !== "All" && newSearch) {
      route = `/${categorySlug}/${searchSlug}`;
    } else if (newCategory !== "All") {
      route = `/${categorySlug}`;
    } else if (searchSlug) {
      route = `/subject/${searchSlug}`;
    }

    navigate(route);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openCategoryPage = (category) => {
    openExploreCourses("", category);
  };

  const chooseCategory = (category) => {
    setSelectedCategory(category);
    setSearch("");
    closeMenus();
  };

  const openCourse = (course) => {
    setSelectedCourse(course);
  };

  const dropdownOptions = {
    courses: [
      {
        title: "All Learning Programs",
        detail: "School to PhD and professional courses",
        action: () => openExploreCourses("", "All")
      },
      {
        title: "School Classes",
        detail: "Class 1 to Class 12",
        action: () => openCategoryPage("All")
      },
      {
        title: "College and University",
        detail: "Degrees and academic subjects",
        action: () => openExploreCourses("", "Undergraduate")
      },
      {
        title: "Professional Courses",
        detail: "Technology, business and science",
        action: () => openExploreCourses("", "Technology")
      }
    ]
  };

  const renderDropdown = (menu, title, options) => (
    openMenu === menu && (
      <div className="nav-dropdown">
        <h3>{title}</h3>

        {options.map((option) => (
          <button
            className="nav-dropdown-item"
            key={option.title}
            onClick={option.action}
          >
            <span>
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </span>
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
    )
  );
if (
  import.meta.env.DEV &&
  location.pathname === "/dev/admin-setup"
) {
  return <DemoAdminSetup />;
}
  if (location.pathname === "/signup") {
    return <SignupPage />;
  }
  if (location.pathname === "/forgot-password") return <ForgotPasswordPage />;
  if (location.pathname === "/reset-password") return <ResetPasswordPage />;
  if (location.pathname === "/login") {
    return <LoginPage />;
  }

  if (
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/")
  ) {
    return <DashboardPage />;
  }

  if (
    location.pathname === "/student/dashboard" ||
    location.pathname.startsWith("/student/dashboard/")
  ) {
    return <DashboardPage />;
  }

  if (
    location.pathname === "/teacher/dashboard" ||
    location.pathname.startsWith("/teacher/dashboard/")
  ) {
    return <DashboardPage />;
  }

if (
  location.pathname === "/dashboard"
) {
  return (
    <div className="website">
      <header className="navbar">
        <button className="brand" onClick={() => {
          closeMenus();
          navigate("/");
        }}>
          <span className="brand-icon">
            <GraduationCap size={25} />
          </span>
          <span>
            EduConnect<span className="brand-ai"> AI</span>
          </span>
        </button>

        <button
          className="mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          aria-controls="dashboard-primary-navigation"
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>

        <nav
          id="dashboard-primary-navigation"
          className={`nav-links ${mobileOpen ? "nav-open" : ""}`}
        >
          <div className="nav-items">
            <button className="nav-option" onClick={() => {
              closeMenus();
              navigate("/courses");
            }}>
              Classes <ChevronDown size={15} />
            </button>
            <button className="nav-option" onClick={() => {
              closeMenus();
              navigate("/courses");
            }}>
              Courses <ChevronDown size={15} />
            </button>
            <button className="nav-option" onClick={() => {
              closeMenus();
              navigate("/technology");
            }}>
              Technology
            </button>
            <button className="nav-option" onClick={() => goTo("fields")}>
              Subjects
            </button>
            <button className="nav-option" onClick={() => goTo("about")}>
              About
            </button>
          </div>
        </nav>
      </header>
      <DashboardPage />
    </div>
  );
}

  if ((currentPage === "home" || location.pathname === "/teachers") && !showGlobalCart) {
    return <LandingPage page={location.pathname === "/teachers" ? "teachers" : "home"} fields={professionalFields} faqs={helpFaqs} onOpenCart={openGlobalCart} cartCount={cartCount} />;
  }

  return (
    <div className="website">

      {/* NAVBAR - Remains visible on every page */}
      <header className="navbar">
        <button
          className="brand"
          onClick={() => {
            navigate("/");
            closeMenus();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <span className="brand-icon">
            <GraduationCap size={25} />
          </span>
          <span>
            EduConnect<span className="brand-ai"> AI</span>
          </span>
        </button>

        {/* Toggles the responsive navigation menu on smaller screens. */}
        <button
          className="mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>

        <nav
          id="primary-navigation"
          className={`nav-links ${mobileOpen ? "nav-open" : ""}`}
        >
          <div className="nav-items">
            <div className="nav-category-wrapper">
              <button
                className={`nav-option ${openMenu === "categories" ? "active" : ""}`}
                onClick={() => toggleMenu("categories")}
              >
                Classes <ChevronDown size={15} />
              </button>

              {openMenu === "categories" && (
                <div className="category-dropdown">
                  <h3>Choose Your Class</h3>

                  {categories.map((category) => {
                    const Icon = category.icon;

                    return (
                      <button
                        className="dropdown-category"
                        key={category.name}
                        onClick={() => openCategoryPage(category.name)}
                      >
                        <span className={`mini-icon ${category.color}`}>
                          <Icon size={17} />
                        </span>

                        <span className="dropdown-category-text">
                          <strong>{category.name}</strong>
                          <small>{category.count}</small>
                        </span>

                        <ArrowRight size={14} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="nav-category-wrapper">
              <button
                className={`nav-option ${openMenu === "courses" ? "active" : ""}`}
                onClick={() => toggleMenu("courses")}
              >
                Courses <ChevronDown size={15} />
              </button>

              {renderDropdown(
                "courses",
                "Explore Education",
                dropdownOptions.courses
              )}
            </div>

            <button
              className="nav-option"
              onClick={() => openExploreCourses("Machine Learning", "All")}
            >
              Technology
            </button>

            <button
              className="nav-option"
              onClick={() => goTo("fields")}
            >
              Subjects
            </button>

            <button
              className="nav-option"
              onClick={() => goTo("about")}
            >
              About
            </button>
          </div>

          <div className="nav-actions">
            <button
              type="button"
              className="cart-nav-btn"
              onClick={openGlobalCart}
              aria-label={`My Cart, ${cartCount} items`}
            >
              <ShoppingCart size={18} />
              <span>My Cart ({cartCount})</span>
            </button>

            <button
              className="login-btn"
              onClick={() => {
                closeMenus();
                navigate("/login");
              }}
            >
              Log in
            </button>

            <button
              className="signup-btn"
              onClick={() => {
                closeMenus();
                navigate("/signup");
              }}
            >
              Sign up
            </button>
          </div>
        </nav>
      </header>

      {/* MAIN CONTENT */}
      <main>

        {paymentReturn ? (
          <PaymentReturnPage />
        ) : showGlobalCart ? (
          <CartPage
            email={getStudentEmail()}
            onBack={() => setShowGlobalCart(false)}
            onComplete={() => {
              setShowGlobalCart(false);
              navigate("/student/dashboard");
            }}
          />
        ) : courseRoute ? (
          <PublishedCourses
            courseRoute={courseRoute}
            backTo={location.state?.from || "/"}
          />
        ) : currentPage === "courses" ? (

          <ExploreCourses
            initialSearch={exploreRouteState.search}
            initialCategory={exploreRouteState.category}
            initialProgramId={new URLSearchParams(location.search).get("program") || ""}
          />

        ) : (

          <>

            {/* HERO */}
            <section className="hero-section" id="home">
              <div className="hero-content">
                <div className="hero-pill">
                  <Sparkles size={15} />
                  Learning for Everyone
                </div>

                <h1>
                  Learn Better With <span>EduConnect AI</span>
                </h1>

                <p>
                  Explore school education, university degrees, research
                  subjects and professional learning in one platform.
                </p>

                <div className="hero-search">
                  <Search size={20} />

                  <input
                    type="text"
                    placeholder="Search courses, subjects, degrees..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedCategory("All");
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      openExploreCourses(search, "All")
                    }
                  />

                  <button
                    onClick={() => openExploreCourses(search, "All")}
                  >
                    Search Courses
                  </button>
                </div>

                <div className="hero-trust">
                  <div className="avatar-stack">
                    <ResilientImage src="https://i.pravatar.cc/60?img=11" alt="Student" />
                    <ResilientImage src="https://i.pravatar.cc/60?img=12" alt="Student" />
                    <ResilientImage src="https://i.pravatar.cc/60?img=13" alt="Student" />
                    <ResilientImage src="https://i.pravatar.cc/60?img=14" alt="Student" />
                  </div>

                  <span>
                    <strong>School to PhD</strong> learning in one place
                  </span>
                </div>
              </div>

              <div className="hero-visual">
                <div className="hero-image-wrap">
                  <ResilientImage
                    src="https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1000"
                    alt="Students learning"
                  />

                  <div className="floating-card learning-card">
                    <span className="floating-icon">
                      <BookOpen size={19} />
                    </span>
                    <span>
                      <strong>All Levels</strong>
                      <small>Learning Resources</small>
                    </span>
                  </div>

                  <div className="floating-card rating-card">
                    <span className="rating-star">
                      <Star size={17} fill="currentColor" />
                    </span>
                    <span>
                      <strong>Explore</strong>
                      <small>Knowledge and Skills</small>
                    </span>
                  </div>
                </div>

                <div className="hero-decoration hero-decoration-one"></div>
                <div className="hero-decoration hero-decoration-two"></div>
              </div>
            </section>

            {/* STATS */}
            <section className="stats-section">
              <div className="stat-item">
                <Users />
                <div>
                  <strong>12+</strong>
                  <span>School Classes</span>
                </div>
              </div>

              <div className="stat-item">
                <BookOpen />
                <div>
                  <strong>Multiple</strong>
                  <span>Education Levels</span>
                </div>
              </div>

              <div className="stat-item">
                <GraduationCap />
                <div>
                  <strong>Global</strong>
                  <span>Learning Subjects</span>
                </div>
              </div>

              <div className="stat-item">
                <Award />
                <div>
                  <strong>Explore</strong>
                  <span>Learning Resources</span>
                </div>
              </div>
            </section>

            <PublishedCourses
              layout="carousel"
              title="Explore"
              eyebrow="EXPLORE COURSES"
              description="Browse courses published by our teachers. Select a course to view its lessons and details."
              onViewAll={() => openExploreCourses("", "All")}
            />

            {/* PROFESSIONAL FIELDS */}
            <section className="section courses-section" id="fields">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">EXPLORE KNOWLEDGE</span>
                  <h2>
                    Popular <span>Study Fields</span>
                  </h2>
                  <p>
                    Explore academic and professional subjects from different fields.
                  </p>
                </div>

              </div>

              <div className="study-fields-carousel">
                <button
                  type="button"
                  className="study-fields-scroll-button"
                  aria-label="Scroll to previous study fields"
                  title="Previous fields"
                  aria-hidden={!canScrollFieldsBack}
                  tabIndex={canScrollFieldsBack ? 0 : -1}
                  onClick={() =>
                    studyFieldsRef.current?.scrollBy({
                      left: -480,
                      behavior: "smooth",
                    })
                  }
                  style={{ visibility: canScrollFieldsBack ? "visible" : "hidden" }}
                >
                  <ArrowLeft size={21} />
                </button>

                <div className="study-fields-track" ref={studyFieldsRef}>
                  {professionalFields.map((field) => {
                    const Icon = field.icon;

                    return (
                      <button
                        className="category-card study-field-card"
                        key={field.name}
                        onClick={() => openExploreCourses(field.name, "All")}
                      >
                        <span className="category-icon purple study-field-icon">
                          <Icon size={25} />
                        </span>

                        <strong>{field.name}</strong>
                        <small>{field.category}</small>

                        <span className="category-arrow">
                          <ArrowRight size={17} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="study-fields-scroll-button"
                  aria-label="Scroll to more study fields"
                  title="More fields"
                  aria-hidden={!canScrollFieldsForward}
                  tabIndex={canScrollFieldsForward ? 0 : -1}
                  onClick={() =>
                    studyFieldsRef.current?.scrollBy({
                      left: 480,
                      behavior: "smooth",
                    })
                  }
                  style={{ visibility: canScrollFieldsForward ? "visible" : "hidden" }}
                >
                  <ArrowRight size={21} />
                </button>
              </div>

              <div className="study-fields-view-all">
                <button
                  className="text-link"
                  onClick={() => openExploreCourses("", "All")}
                >
                  View All Courses <ArrowRight size={17} />
                </button>
              </div>

              <StudyPartners />
            </section>

            {/* TRENDING COURSES */}
            <section className="section courses-section" id="courses">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">POPULAR LEARNING</span>
                  <h2>
                    Trending <span>Courses</span>
                  </h2>
                  <p>
                    Explore popular courses and discover your next learning path.
                  </p>
                </div>

                <button
                  className="text-link"
                  onClick={() => openExploreCourses("", "All")}
                >
                  View All Courses <ArrowRight size={17} />
                </button>
              </div>

              <div
                className="trending-carousel"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                }}
              >
                <button
                  type="button"
                  aria-label="Scroll to previous trending courses"
                  title="Previous courses"
                  aria-hidden={!canScrollTrendingBack}
                  tabIndex={canScrollTrendingBack ? 0 : -1}
                  onClick={() =>
                    trendingCoursesRef.current?.scrollBy({
                      left: -480,
                      behavior: "smooth",
                    })
                  }
                  style={{
                    flex: "0 0 46px",
                    width: "46px",
                    height: "46px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    borderRadius: "50%",
                    background: "#7c3aed",
                    color: "#ffffff",
                    cursor: "pointer",
                    boxShadow: "0 5px 14px rgba(124, 58, 237, 0.25)",
                    visibility: canScrollTrendingBack ? "visible" : "hidden",
                  }}
                >
                  <ArrowLeft size={21} />
                </button>

                <div className="trending-courses-viewport">
                  <div
                    ref={trendingCoursesRef}
                    className="trending-courses-track"
                  >
                  {[
                    { name: "React JS", detail: "Frontend Development", price: "Rs. 2,499", image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600" },
                    { name: "Web Development", detail: "Build Modern Websites", price: "Rs. 3,499", image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600" },
                    { name: "Python Programming", detail: "Programming Skills", price: "Rs. 2,999", image: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=600" },
                    { name: "Artificial Intelligence", detail: "AI and Innovation", price: "Rs. 4,999", image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600" },
                    { name: "Data Science", detail: "Data and Analytics", price: "Rs. 4,499", image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600" },
                    { name: "Machine Learning", detail: "Intelligent Systems", price: "Rs. 4,999", image: "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=600" },
                    { name: "Cyber Security", detail: "Digital Security", price: "Rs. 3,999", image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600" },
                    { name: "Graphic Design", detail: "Creative Design", price: "Rs. 2,499", image: "https://images.unsplash.com/photo-1545235617-9465d2a55698?w=600" },
                    { name: "UI/UX Design", detail: "User Experience", price: "Rs. 2,999", image: "https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=600" },
                    { name: "Cloud Computing", detail: "Cloud Technologies", price: "Rs. 3,999", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600" },
                    { name: "Business Administration", detail: "Business Skills", price: "Rs. 3,499", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600" },
                    { name: "Digital Marketing", detail: "Online Marketing", price: "Rs. 2,499", image: "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=600" },
                  ].map((course) => (
                    <button
                      className="trending-course-card"
                      key={course.name}
                      onClick={() => openExploreCourses(course.name, "All")}
                      style={{
                        minHeight: "275px",
                        padding: "10px",
                        overflow: "hidden",
                        border: "1px solid #e9ddff",
                        borderRadius: "18px",
                        background: "#ffffff",
                        color: "#211a35",
                        textAlign: "left",
                        cursor: "pointer",
                        boxShadow: "0 5px 18px rgba(91, 33, 182, 0.08)",
                        transition: "all 0.25s ease",
                        display: "flex",
                        flexDirection: "column",
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.background =
                          "#faf7ff";
                        event.currentTarget.style.transform = "translateY(-5px)";
                        event.currentTarget.style.boxShadow =
                          "0 14px 28px rgba(91, 33, 182, 0.25)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = "#ffffff";
                        event.currentTarget.style.transform = "translateY(0)";
                        event.currentTarget.style.boxShadow =
                          "0 5px 18px rgba(91, 33, 182, 0.08)";
                      }}
                    >
                      <ResilientImage
                        src={course.image}
                        alt={course.name}
                        style={{
                          width: "100%",
                          height: "145px",
                          objectFit: "cover",
                          borderRadius: "11px",
                        }}
                      />
                      <span style={{ padding: "14px 8px 8px", display: "block" }}>
                        <strong
                          style={{
                            display: "block",
                            fontSize: "16px",
                            marginBottom: "7px",
                            whiteSpace: "nowrap",
                            color: "#211a35",
                          }}
                        >
                          {course.name}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            fontSize: "12px",
                            color: "#766b8c",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {course.detail}
                        </span>
                        <strong
                          style={{
                            display: "block",
                            marginTop: "12px",
                            fontSize: "15px",
                            color: "#6d28d9",
                          }}
                        >
                          {course.price}
                        </strong>
                      </span>
                    </button>
                  ))}
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Scroll to more trending courses"
                  title="More courses"
                  aria-hidden={!canScrollTrendingForward}
                  tabIndex={canScrollTrendingForward ? 0 : -1}
                  onClick={() =>
                    trendingCoursesRef.current?.scrollBy({
                      left: 480,
                      behavior: "smooth",
                    })
                  }
                  style={{
                    flex: "0 0 46px",
                    width: "46px",
                    height: "46px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    borderRadius: "50%",
                    background: "#7c3aed",
                    color: "#ffffff",
                    cursor: "pointer",
                    boxShadow: "0 5px 14px rgba(124, 58, 237, 0.25)",
                    visibility: canScrollTrendingForward ? "visible" : "hidden",
                  }}
                >
                  <ArrowRight size={21} />
                </button>
              </div>
            </section>

            {/* WHY US */}
            <section className="why-section" id="about">
              <div className="why-image">
                <ResilientImage
                  src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900"
                  alt="Online learning"
                />

                <div className="why-badge">
                  <strong>All</strong>
                  <span>Education Levels</span>
                </div>
              </div>

              <div className="why-content">
                <span className="eyebrow">WHY EDUCONNECT AI?</span>

                <h2>
                  Study Smarter. Learn <span>Every Day.</span>
                </h2>

                <p>
                  Explore organized learning programs from school education
                  to university and professional subjects.
                </p>

                <div className="benefit-list">
                  <div>
                    <CheckCircle2 />
                    <span>
                      <strong>Multiple Education Levels</strong>
                      <small>Explore school, college and university.</small>
                    </span>
                  </div>

                  <div>
                    <CheckCircle2 />
                    <span>
                      <strong>Different Study Fields</strong>
                      <small>Technology, science, business and more.</small>
                    </span>
                  </div>

                  <div>
                    <CheckCircle2 />
                    <span>
                      <strong>Organized Courses</strong>
                      <small>Find subjects and learning topics.</small>
                    </span>
                  </div>

                  <div>
                    <CheckCircle2 />
                    <span>
                      <strong>Learn at Your Own Pace</strong>
                      <small>Explore learning resources anytime.</small>
                    </span>
                  </div>
                </div>

                <button
                  className="primary-btn"
                  onClick={() => openExploreCourses("", "All")}
                >
                  Explore Courses <ArrowRight size={17} />
                </button>
              </div>
            </section>

            {/* LEARNING AREAS */}
            <section className="section instructors-section learning-areas-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">LEARNING AREAS</span>
                  <h2>
                    Explore <span>Different Subjects</span>
                  </h2>
                  <p>
                    Browse organized learning areas and study resources.
                  </p>
                </div>
                <button
                  className="text-link"
                  onClick={() => openExploreCourses("", "All")}
                >
                  View All Courses <ArrowRight size={17} />
                </button>
              </div>

              <div className="instructor-grid learning-area-grid">
                {instructors.map((person) => (
                  <article className="instructor-card learning-area-card" key={person.name}>
                    <div className="learning-area-cover">
                      <ResilientImage src={person.cover} alt="" loading="lazy" />
                    </div>

                    <h3>{person.name}</h3>
                    <p className="instructor-expertise">{person.expertise}</p>

                    <div className="learning-area-tags">
                      <span><BookOpen size={13} /> {person.courses} Learning Areas</span>
                      <span>{person.students}</span>
                    </div>

                    <button
                      className="instructor-link learning-area-link"
                      onClick={() => openExploreCourses(person.role, "All")}
                    >
                      Explore {person.role} <ArrowRight size={15} />
                    </button>
                  </article>
                ))}
              </div>

              <div className="popular-skills">
                <div className="popular-skills-heading">
                  <div>
                    <span className="eyebrow">KEEP LEARNING</span>
                    <h3>Popular Skills</h3>
                  </div>
                  <p>Explore popular skills in technology, science, business, and creative fields.</p>
                </div>
                <div className="popular-skills-grid">
                  <button
                    className="popular-skill-feature"
                    onClick={() => openExploreCourses("Artificial Intelligence", "All")}
                  >
                    <span className="popular-skill-feature-icon">
                      <Brain size={23} />
                    </span>
                    <span className="popular-skill-feature-label">FEATURED SUBJECT</span>
                    <strong>Artificial Intelligence</strong>
                    <span className="popular-skill-feature-description">
                      Explore AI and intelligent systems.
                    </span>
                    <span className="popular-skill-feature-link">
                      Explore AI courses <ArrowRight size={15} />
                    </span>
                  </button>

                  {/* Each skill arrow opens the matching course and shows a hover label. */}
                  {popularSkillGroups.map((group) => (
                    <div className="popular-skills-column" key={group.name}>
                      <h4>{group.name}</h4>
                      {group.skills.map((skill) => (
                        <button
                          className="popular-skill-link"
                          key={skill}
                          onClick={() => openExploreCourses(skill, "All")}
                        >
                          {skill}
                          <span
                            className="popular-skill-arrow"
                            data-tooltip={`Explore ${skill}`}
                            aria-hidden="true"
                          >
                            <ArrowRight size={14} />
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* LEARNING BANNER */}
            <section className="teach-section">
              <div className="teach-content">
                <span className="eyebrow light-eyebrow">
                  YOUR EDUCATION JOURNEY
                </span>

                <h2>
                  Your Knowledge Starts With <span>EduConnect AI</span>
                </h2>

                <p>
                  From your first school lesson to advanced research,
                  explore subjects and learning opportunities.
                </p>

                <div className="teach-points">
                  <span>
                    <CheckCircle2 size={17} /> School to PhD
                  </span>
                  <span>
                    <CheckCircle2 size={17} /> Academic Subjects
                  </span>
                  <span>
                    <CheckCircle2 size={17} /> Professional Skills
                  </span>
                </div>

                <button
                  className="teach-btn"
                  onClick={() => openExploreCourses("", "All")}
                >
                  Explore Learning <ArrowRight size={17} />
                </button>
              </div>

              <div className="teach-art">
                <GraduationCap size={170} strokeWidth={1} />
                <Sparkles className="teach-sparkle" size={42} />
              </div>
            </section>

            {/* TESTIMONIALS */}
            <section className="section testimonials-section">
              <div className="section-heading centered-heading">
                <div>
                  <span className="eyebrow">LEARNING EXPERIENCE</span>
                  <h2>
                    Knowledge for <span>Everyone</span>
                  </h2>
                  <p>
                    A learning platform for different education levels.
                  </p>
                </div>
              </div>

              <div className="testimonial-grid">
                {testimonials.map((item) => (
                  <article className="testimonial-card" key={item.role}>
                    <Quote className="quote-icon" size={30} fill="currentColor" />

                    <p>{item.text}</p>

                    <div className="testimonial-person">
                      <img
                        src={item.image}
                        alt=""
                        width="48"
                        height="48"
                        loading="eager"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                          event.currentTarget.nextElementSibling.hidden = false;
                        }}
                      />
                      <span className="testimonial-avatar-fallback" hidden>
                        {item.initials}
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.role}</small>
                      </span>
                    </div>

                    <button
                      className="testimonial-link"
                      onClick={() => openExploreCourses("", item.category)}
                    >
                      {item.action} <ArrowRight size={15} />
                    </button>
                  </article>
                ))}
              </div>
            </section>

            {/* FAQ */}
            <section className="section faq-section">
              <div className="section-heading centered-heading">
                <div>
                  <span className="eyebrow">NEED HELP?</span>
                  <h2>
                    Frequently Asked <span>Questions</span>
                  </h2>
                  <p>Some answers to help you get started.</p>
                </div>
              </div>

              <div className="faq-list">
                {helpFaqs.map(({ question, answer, id }, index) => (
                  <div
                    className={`faq-item ${faqOpen === index ? "faq-active" : ""}`}
                    key={id || question}
                  >
                    <button
                      onClick={() =>
                        setFaqOpen(faqOpen === index ? -1 : index)
                      }
                    >
                      {question}
                      <ChevronDown size={19} />
                    </button>

                    {faqOpen === index && <p>{answer}</p>}
                  </div>
                ))}
              </div>
            </section>

            {/* SIGNUP CTA */}
            <section className="signup-cta" id="signup">
              <div className="cta-decoration"></div>

              <span className="eyebrow light-eyebrow">
                YOUR LEARNING STARTS HERE
              </span>

              <h2>Ready to Explore Knowledge?</h2>

              <p>
                Discover school subjects, academic degrees and professional courses.
              </p>

              <button
                className="cta-btn"
                onClick={() => navigate("/signup")}
              >
                Create Free Account <ArrowRight size={17} />
              </button>
            </section>

          </>
        )}

      </main>

      {/* FOOTER - Same on every page */}
      <footer className="footer">
        <div className="footer-explore">
          <div className="footer-learning-partners">
            <p>Explore school subjects, university programs and career skills with tools and learning platforms</p>
            {/* Shows accessible platform logos in the footer. */}
            <div className="footer-learning-logos" aria-label="Education and technology platforms">
              {STUDY_PARTNERS.filter(({ name }) => ["Coursera", "GitHub", "Google Scholar"].includes(name)).map((company) => (
                <div
                  className="footer-learning-logo"
                  key={company.name}
                  data-tooltip={company.name}
                  aria-label={company.name}
                  tabIndex={0}
                >
                  <img src={company.logo} alt={company.name} />
                </div>
              ))}
            </div>
          </div>
          <h3>Explore popular subjects and learning areas</h3>
          <div className="footer-explore-grid">
            {[
              {
                title: "Education Levels",
                items: [
                  { label: "School Classes", search: "", category: "All" },
                  { label: "College Programs", search: "", category: "College" },
                  { label: "Undergraduate Studies", search: "", category: "Undergraduate" },
                  { label: "Postgraduate Studies", search: "", category: "Postgraduate" },
                  { label: "Doctoral Studies", search: "", category: "Doctoral" },
                ],
              },
              {
                title: "Technology",
                items: [
                  { label: "Computer Science", search: "Computer Science", category: "All" },
                  { label: "Artificial Intelligence", search: "Artificial Intelligence", category: "All" },
                  { label: "Web Development", search: "Web Development", category: "All" },
                  { label: "Data Science", search: "Data Science", category: "All" },
                  { label: "Cyber Security", search: "Cyber Security", category: "All" },
                ],
              },
              {
                title: "Science & Health",
                items: [
                  { label: "Engineering", search: "Engineering", category: "All" },
                  { label: "Medical Sciences", search: "Medical Sciences", category: "All" },
                  { label: "Physics", search: "Physics", category: "All" },
                  { label: "Chemistry", search: "Chemistry", category: "All" },
                  { label: "Biology", search: "Biology", category: "All" },
                ],
              },
              {
                title: "Business & Humanities",
                items: [
                  { label: "Business Administration", search: "Business Administration", category: "All" },
                  { label: "Accounting and Finance", search: "Accounting and Finance", category: "All" },
                  { label: "Graphic Design", search: "Graphic Design", category: "All" },
                  { label: "Law", search: "Law", category: "All" },
                  { label: "Psychology", search: "Psychology", category: "All" },
                ],
              },
              {
                title: "Certifications",
                items: [
                  { label: "AI & Machine Learning", search: "Artificial Intelligence", category: "All" },
                  { label: "Cyber Security", search: "Cyber Security", category: "All" },
                  { label: "Cloud Computing", search: "Cloud Computing", category: "All" },
                  { label: "Data Science", search: "Data Science", category: "All" },
                  { label: "Business Administration", search: "Business Administration", category: "All" },
                ],
              },
            ].map((group) => (
              <div className="footer-explore-column" key={group.title}>
                <h4>{group.title}</h4>
                {group.items.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => openExploreCourses(item.search, item.category)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="footer-main">
          <div className="footer-about">
            <button
              className="brand footer-brand"
              onClick={() => {
                navigate("/");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span className="brand-icon">
                <GraduationCap size={25} />
              </span>

              <span>
                EduConnect<span className="brand-ai"> AI</span>
              </span>
            </button>

            <p>
              A learning platform for school, university, research and
              professional education.
            </p>

            <div className="social-links">
              <a href="#home" aria-label="Facebook">f</a>
              <a href="#home" aria-label="Instagram">◎</a>
              <a href="#home" aria-label="LinkedIn">in</a>
            </div>
          </div>

          <div className="footer-column">
            <h4>Explore</h4>
            <button onClick={() => openExploreCourses("", "All")}>
              All Courses
            </button>
            <button onClick={() => openCategoryPage("Class 1")}>
              School Classes
            </button>
            <button onClick={() => openExploreCourses("", "Undergraduate")}>
              University
            </button>
            <button onClick={() => openExploreCourses("", "Doctoral")}>
              PhD
            </button>
          </div>

          <div className="footer-column">
            <h4>Study Fields</h4>
            <button onClick={() => openExploreCourses("Computer Science", "All")}>
              Computer Science
            </button>
            <button onClick={() => openExploreCourses("Science", "All")}>
              Science
            </button>
            <button onClick={() => openExploreCourses("Business", "All")}>
              Business
            </button>
            <button onClick={() => openExploreCourses("Engineering", "All")}>
              Engineering
            </button>
          </div>

          <div className="footer-column footer-contact">
            <h4>Contact</h4>
            <span><Mail size={16} /> hello@educonnect.ai</span>
            <span><Phone size={16} /> Contact support</span>
            <span><Globe size={16} /> Online learning platform</span>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 EduConnect AI. All rights reserved.</span>
          <span>
            Made for curious minds <Sparkles size={14} />
          </span>
        </div>
      </footer>

      {/* Lets visitors smoothly return to the top after scrolling down. */}
      {showScrollTop && (
        <button
          className="scroll-to-top"
          type="button"
          aria-label="Scroll to top"
          title="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ChevronUp size={21} />
        </button>
      )}

      {/* COURSE MODAL */}
      {selectedCourse && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedCourse(null)}
        >
          <div
            className="modal-box course-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedCourse(null)}
            >
              <X />
            </button>

            <ResilientImage src={selectedCourse.image} alt={selectedCourse.title} />

            <span className="eyebrow">{selectedCourse.category}</span>
            <h2>{selectedCourse.title}</h2>
            <p>{selectedCourse.description}</p>

            <div className="modal-course-details">
              <span><BookOpen size={16} /> {selectedCourse.lessons} Topics</span>
              <span><GraduationCap size={16} /> {selectedCourse.level}</span>
              <span>Learning Program</span>
            </div>

            <button
              className="primary-btn full-btn"
              onClick={() => {
                setSelectedCourse(null);
                openCategoryPage(selectedCourse.category);
              }}
            >
              Explore This Class <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* LOGIN / SIGNUP MODALS */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={() => setModal("")}
        >
          <div
            className="modal-box form-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setModal("")}
            >
              <X />
            </button>

            <div className="modal-logo">
              <GraduationCap size={27} />
            </div>

            {modal === "login" && (
              <>
                <h2>Welcome Back!</h2>
                <p>Log in to continue your studies.</p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    alert("Login will be connected with the backend later.");
                    setModal("");
                  }}
                >
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    required
                  />

                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    required
                  />

                  <button className="primary-btn full-btn" type="submit">
                    Log in
                  </button>
                </form>
              </>
            )}

            {modal === "signup" && (
              <>
                <h2>Create Your Account</h2>
                <p>Join EduConnect AI and start learning.</p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    alert("Registration will be connected with the backend later.");
                    setModal("");
                  }}
                >
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    required
                  />

                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    required
                  />

                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="Create a password"
                    required
                  />

                  <button className="primary-btn full-btn" type="submit">
                    Create Account
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
