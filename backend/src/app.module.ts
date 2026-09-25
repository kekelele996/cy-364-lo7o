import { Module } from "@nestjs/common";
import { OverviewController } from "./overview/overview.controller";
import { OverviewService } from "./overview/overview.service";
import { AppLogger } from "./common/app.logger";

@Module({
  controllers: [OverviewController],
  providers: [OverviewService, AppLogger],
})
export class AppModule {}
