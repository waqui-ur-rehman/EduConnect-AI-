const coverPalettes = [
  ["#f3b84b", "#e77d52", "#6655c8"],
  ["#48a99b", "#4d83cb", "#e8a34b"],
  ["#d76f73", "#6957bc", "#49a79a"],
  ["#4c83c9", "#e7a74c", "#d66c76"],
  ["#6958bd", "#49a99b", "#e77d52"],
  ["#e6a14a", "#d66c76", "#4b8ac6"],
  ["#49a99b", "#e4a247", "#6b59bd"],
  ["#d66e75", "#4b83c6", "#48a899"],
  ["#4b83c6", "#6c58ba", "#e4a247"],
  ["#e4a247", "#4aa899", "#d66d76"],
  ["#6b58ba", "#d66d76", "#4b83c6"],
  ["#4aa899", "#e4a247", "#6c58ba"]
];

export default function ClassBooksArtwork({ classNumber, className = "" }) {
  const [front, middle, back] =
    coverPalettes[(classNumber - 1) % coverPalettes.length];

  return (
    <svg
      className={className}
      viewBox="0 0 1600 500"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`Colorful textbooks for Class ${classNumber}`}
    >
      <defs>
        <linearGradient id="book-page" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fffefb" />
          <stop offset="1" stopColor="#e9e4f2" />
        </linearGradient>
        <linearGradient id="book-shine" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" stopOpacity=".4" />
          <stop offset=".6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="book-shadow" x="850" y="35" width="650" height="500" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#16052f" floodOpacity=".32" />
        </filter>
      </defs>

      <g opacity=".14" fill="none" stroke="#fff" strokeWidth="2">
        <circle cx="1240" cy="250" r="205" />
        <circle cx="1240" cy="250" r="165" />
        <path d="M1015 95h390M980 420h470" />
      </g>

      <g filter="url(#book-shadow)" transform="rotate(-7 1200 260)">
        <rect x="1015" y="88" width="360" height="118" rx="13" fill="url(#book-page)" />
        <path d="M1034 88v118" stroke="#d6d0df" strokeWidth="8" />
        <rect x="1045" y="64" width="360" height="118" rx="13" fill={back} />
        <path d="M1064 64v118" stroke="#fff" strokeOpacity=".36" strokeWidth="9" />
        <path d="M1110 104h207M1110 124h152" stroke="#fff" strokeOpacity=".78" strokeWidth="7" strokeLinecap="round" />
      </g>

      <g filter="url(#book-shadow)" transform="rotate(5 1190 300)">
        <rect x="955" y="208" width="390" height="120" rx="13" fill="url(#book-page)" />
        <path d="M975 208v120" stroke="#d6d0df" strokeWidth="8" />
        <rect x="982" y="185" width="390" height="120" rx="13" fill={middle} />
        <path d="M1002 185v120" stroke="#fff" strokeOpacity=".38" strokeWidth="9" />
        <circle cx="1176" cy="240" r="22" fill="#fff" fillOpacity=".2" />
        <path d="m1176 224 5 11 12 1-9 8 3 12-11-6-10 6 2-12-9-8 12-1 5-11Z" fill="#fff" fillOpacity=".92" />
      </g>

      <g filter="url(#book-shadow)" transform="rotate(-3 1190 390)">
        <rect x="930" y="334" width="430" height="126" rx="14" fill="url(#book-page)" />
        <path d="M952 334v126" stroke="#d6d0df" strokeWidth="9" />
        <rect x="960" y="308" width="430" height="126" rx="14" fill={front} />
        <path d="M982 308v126" stroke="#fff" strokeOpacity=".4" strokeWidth="9" />
        <path d="M1020 343h310" stroke="#fff" strokeOpacity=".28" strokeWidth="2" />
        <text x="1020" y="379" fill="#fff" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="700" letterSpacing="3">
          STUDY BOOK
        </text>
        <text x="1020" y="411" fill="#fff" fontFamily="Arial, sans-serif" fontSize="24" fontWeight="700">
          CLASS {classNumber}
        </text>
        <path d="M1000 310h340l-130 120h-210Z" fill="url(#book-shine)" />
      </g>

      <g fill="#fff" opacity=".8">
        <path d="m895 157 6 15 15 6-15 6-6 15-6-15-15-6 15-6 6-15Z" />
        <circle cx="1450" cy="170" r="6" />
        <circle cx="1440" cy="375" r="4" />
      </g>
    </svg>
  );
}
