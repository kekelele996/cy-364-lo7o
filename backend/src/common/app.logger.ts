import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class AppLogger {
  private readonly logger = new Logger("ldstoreinventory");

  info(message: string) {
    this.logger.log(message);
  }
}
