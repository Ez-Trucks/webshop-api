import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdAssistantService } from './ad-assistant.service';
import { CreateDraftDto, PublishDto, RevisionDto, UpdateDraftDto } from './ad-assistant.dto';
@Controller('admin/ad-drafts')
@UseGuards(AuthGuard)
export class AdAssistantController {
  constructor(private service: AdAssistantService) {}
  @Get('capabilities') capabilities() { return this.service.capabilities(); }
  @Get() list() { return this.service.list(); }
  @Post() create(@Body() dto: CreateDraftDto) { return this.service.create(dto); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDraftDto) { return this.service.update(id, dto); }
  @Post(':id/analyze') analyze(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto) { return this.service.analyze(id, dto.revision); }
  @Post(':id/generate') generate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto) { return this.service.generate(id, dto.revision, true); }
  @Post(':id/standard-texts') standard(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto) { return this.service.generate(id, dto.revision, false); }
  @Post(':id/publish') publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishDto) { return this.service.publish(id, dto); }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto) { return this.service.remove(id, dto.revision); }
}
