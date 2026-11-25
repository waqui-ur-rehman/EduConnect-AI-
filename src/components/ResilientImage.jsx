import imageFallback from "../assets/education-image-fallback.svg";

export default function ResilientImage({ src, alt = "", ...props }) {
  const handleError = (event) => {
    const image = event.currentTarget;

    if (image.getAttribute("src") !== imageFallback) {
      image.src = imageFallback;
      return;
    }

    image.hidden = true;
  };

  return (
    <img
      {...props}
      src={src || imageFallback}
      alt={alt}
      onError={handleError}
    />
  );
}
