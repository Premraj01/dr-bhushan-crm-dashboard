import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';
import { EmiPlanDto } from './dto/emi-plan.dto';
import { InvoicePdfService } from './invoice-pdf.service';
import { ReceivePaymentDto } from './dto/receive-payment.dto';

/** Billing from the appointment calendar: see what's owed and receive payments. */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('appointments/:id')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing')
  bill(@Param('id') id: string) {
    return this.billing.bill(id);
  }

  @Post('payments')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceivePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.receive(id, dto, user);
  }

  /** Pay the balance in EMIs (part payments on scheduled dates). */
  @Put('billing/emi')
  setEmi(
    @Param('id') id: string,
    @Body() dto: EmiPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.setEmi(id, dto, user);
  }

  @Delete('billing/emi')
  clearEmi(@Param('id') id: string) {
    return this.billing.clearEmi(id);
  }
}

/** The same billing actions, addressed by invoice (used by the Billing page). */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('invoices/:id')
export class InvoiceBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly pdf: InvoicePdfService,
  ) {}

  @Get('billing')
  bill(@Param('id') id: string) {
    return this.billing.invoiceBill(id);
  }

  /** The invoice as a PDF, to print or send to the patient. */
  @Get('pdf')
  async invoicePdf(@Param('id') id: string) {
    const pdf = await this.pdf.render(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${id}.pdf"`,
      length: pdf.length,
    });
  }

  @Post('payments')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceivePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.receiveForInvoice(id, dto, user);
  }

  @Put('billing/emi')
  setEmi(
    @Param('id') id: string,
    @Body() dto: EmiPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.setEmiForInvoice(id, dto, user);
  }

  @Delete('billing/emi')
  clearEmi(@Param('id') id: string) {
    return this.billing.clearEmiForInvoice(id);
  }
}

/** Billing page data: received payments, pending (due now) and upcoming (future EMIs). */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingOverviewController {
  constructor(private readonly billing: BillingService) {}

  @Get('overview')
  overview() {
    return this.billing.overview();
  }
}
