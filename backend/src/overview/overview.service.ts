import { Injectable } from "@nestjs/common";
import { overviewData } from "./overview.data";

@Injectable()
export class OverviewService {
  getOverview() {
    return overviewData;
  }

  getHealth() {
    return { status: "ok" };
  }
}
