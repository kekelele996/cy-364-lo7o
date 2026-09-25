import { Controller, Get } from "@nestjs/common";
import { OverviewService } from "./overview.service";

@Controller()
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get("health")
  health() {
    return this.overviewService.getHealth();
  }

  @Get("api/health")
  apiHealth() {
    return this.overviewService.getHealth();
  }

  @Get("overview")
  overview() {
    return this.overviewService.getOverview();
  }

  @Get("api/overview")
  apiOverview() {
    return this.overviewService.getOverview();
  }
}
