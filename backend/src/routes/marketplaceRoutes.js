import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  checkout,
  listOrders,
  getOrder,
  cancelOrder,
  demoCheckout,
  paymentsConfig,
  myEarnings,
  adminFinanceOverview,
} from "../controllers/marketplaceController.js";

const router = Router();
router.use(protect);
router.get("/cart", authorize("student"), getCart);
router.post("/cart", authorize("student"), addToCart);
router.delete("/cart/:kind/:contentId", authorize("student"), removeFromCart);
router.delete("/cart", authorize("student"), clearCart);
router.post("/orders/checkout", authorize("student"), checkout);
router.get("/orders", authorize("student"), listOrders);
router.get("/orders/:orderNumber", authorize("student"), getOrder);
router.post("/orders/:orderNumber/cancel", authorize("student"), cancelOrder);
router.post("/payments/demo-checkout/:orderNumber", authorize("student"), demoCheckout);
router.get("/payments/config", paymentsConfig);
router.get("/earnings", authorize("teacher"), myEarnings);
router.get("/finance/overview", authorize("admin"), adminFinanceOverview);
export default router;
