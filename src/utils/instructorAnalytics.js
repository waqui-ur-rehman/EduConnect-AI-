import { courseReviewKey, getReviews } from "./courseReviews";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

function nonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function studentIdentity(email, registered) {
  const profile = readJson(`educonnect.student.${email}.profile`, {});
  const account = registered.find((user) => normalize(user?.email) === email);
  return {
    name: profile?.fullName || profile?.name || account?.name || email,
    avatar: profile?.avatar || "",
  };
}

// The same saved records drive the overview, students, sales and analytics pages.
export function collectInstructorCourseAnalytics(email, courses = []) {
  const teacher = normalize(email);
  const byCourse = new Map(
    courses.filter(Boolean).map((course) => [
      String(course.id),
      {
        ...course,
        enrollments: new Set(),
        enrollmentRecords: [],
        sales: 0,
        revenue: 0,
        salesRecords: [],
        ratings: [],
        reviews: 0,
        reviewItems: [],
        monthly: {},
      },
    ]),
  );
  const registeredValue = readJson("educonnect.registeredUsers", []);
  const registered = Array.isArray(registeredValue) ? registeredValue : [];
  const seenOrders = new Set();
  const seenOrderItems = new Set();
  const orderPurchases = new Set();
  const legacyPaidEnrollments = [];
  const keys = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith("educonnect.student.")) keys.push(key);
    }
  } catch {
    return [];
  }

  function addSale(course, record) {
    course.sales += 1;
    course.revenue += record.amount;
    course.salesRecords.push(record);
    const month = String(record.purchasedAt || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      course.monthly[month] = (course.monthly[month] || 0) + record.amount;
    }
  }

  for (const key of keys) {
    if (key.endsWith(".enrollments")) {
      const student = normalize(
        key.slice("educonnect.student.".length, -".enrollments".length),
      );
      const rows = readJson(key, []);
      if (!student || !Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || normalize(row.teacherEmail) !== teacher) continue;
        const course = byCourse.get(String(row.id));
        if (!course || course.enrollments.has(student)) continue;
        course.enrollments.add(student);
        const totalLessons = Array.isArray(course.lessons)
          ? course.lessons.length
          : nonNegativeNumber(course.lessons || row.lessons);
        const completedLessons = Math.min(
          totalLessons,
          nonNegativeNumber(row.completedLessons),
        );
        const progress = totalLessons
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0;
        course.enrollmentRecords.push({
          id: `${student}::${course.id}`,
          ...studentIdentity(student, registered),
          email: student,
          courseId: String(course.id),
          courseTitle: course.title || row.title || "Untitled course",
          enrolledAt: row.enrolledAt || "",
          totalLessons,
          completedLessons,
          progress,
        });
        legacyPaidEnrollments.push({ student, row, course });
      }
    }

    if (key.endsWith(".orders")) {
      const student = normalize(
        key.slice("educonnect.student.".length, -".orders".length),
      );
      const orders = readJson(key, []);
      if (!student || !Array.isArray(orders)) continue;
      for (const order of orders) {
        if (
          !order ||
          !/^(demo\s+)?completed$/i.test(String(order.status || "").trim())
        )
          continue;
        const identity = order.id || order.purchasedAt;
        if (!identity) continue;
        const orderId = `${student}:${identity}`;
        if (seenOrders.has(orderId)) continue;
        seenOrders.add(orderId);
        for (const item of Array.isArray(order.items) ? order.items : []) {
          if (
            !item ||
            item.itemType === "book" ||
            normalize(item.teacherEmail) !== teacher
          )
            continue;
          const course = byCourse.get(String(item.id));
          const itemKey = `${orderId}:${item.id}`;
          if (!course || seenOrderItems.has(itemKey)) continue;
          seenOrderItems.add(itemKey);
          orderPurchases.add(`${student}:${item.id}`);
          addSale(course, {
            id: itemKey,
            student: order.studentEmail || student,
            course: item.title || course.title,
            purchasedAt: order.purchasedAt || "",
            amount: nonNegativeNumber(item.price),
            status: order.status,
          });
        }
      }
    }
  }

  // Earlier checkouts saved the purchase snapshot directly on the enrollment.
  for (const { student, row, course } of legacyPaidEnrollments) {
    const purchaseKey = `${student}:${row.id}`;
    if (
      orderPurchases.has(purchaseKey) ||
      nonNegativeNumber(row.price) <= 0 ||
      !row.enrolledAt
    )
      continue;
    orderPurchases.add(purchaseKey);
    addSale(course, {
      id: `legacy:${purchaseKey}`,
      student,
      course: row.title || course.title,
      purchasedAt: row.enrolledAt,
      amount: nonNegativeNumber(row.price),
      status: "Recorded enrollment",
    });
  }

  const reviews = getReviews();
  return [...byCourse.values()].map(({ enrollments, ...course }) => {
    const reviewKey = courseReviewKey({ ...course, teacherEmail: teacher });
    const reviewItems = reviews.filter(
      (review) => review?.courseKey === reviewKey,
    );
    const ratings = reviewItems
      .map((review) => Number(review.rating))
      .filter(
        (rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5,
      );
    return {
      ...course,
      students: enrollments.size,
      studentEmails: [...enrollments],
      reviewItems,
      reviews: reviewItems.length,
      ratings,
      rating: ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0,
    };
  });
}
