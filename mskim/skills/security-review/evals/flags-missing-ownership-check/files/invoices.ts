import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { invoiceRepo } from "../repos/invoiceRepo";

export const router = Router();

router.get("/invoices/:id", requireAuth, async (req, res) => {
  const invoice = await invoiceRepo.findById(req.params.id);
  if (!invoice || invoice.ownerId !== req.user.id) {
    return res.status(404).json({ error: "not found" });
  }
  res.json(invoice);
});

router.get("/invoices/:id/pdf", requireAuth, async (req, res) => {
  const invoice = await invoiceRepo.findById(req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: "not found" });
  }
  res.type("application/pdf").send(await invoiceRepo.renderPdf(invoice));
});
