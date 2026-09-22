import { Router, type IRouter } from "express";
import healthRouter from "./health";
import askDataRouter from "./askdata";

const router: IRouter = Router();

router.use(healthRouter);
router.use(askDataRouter);

export default router;
