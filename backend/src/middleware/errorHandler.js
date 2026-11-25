
export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error("API route not found."));
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const requestedStatus = err.status || err.statusCode;
  const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus < 500
    ? requestedStatus : res.statusCode >= 400 ? res.statusCode : 500;

  res.status(statusCode).json({
    success: false,
    message: statusCode === 413 ? "Request is too large." : statusCode === 404 ? "API route not found."
      : statusCode < 500 ? "Invalid request." : "Internal Server Error"
  });
};
