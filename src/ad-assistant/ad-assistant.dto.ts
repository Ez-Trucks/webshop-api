import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDefined, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const FACT_KEYS = ['brand', 'type', 'category', 'year', 'mileage', 'euroNorm', 'axleConfig', 'powerHp', 'fuel', 'transmission', 'equipment', 'damage', 'condition'] as const;
export class FactDto {
  @IsIn(FACT_KEYS) key: string;
  @IsString() @MaxLength(2000) value: string;
  @IsString() @MaxLength(500) source: string;
  @IsIn(['document', 'photo', 'manual', 'inferred']) certainty: string;
  @IsBoolean() confirmed: boolean;
}
export class AttachmentDto {
  @IsString() @MaxLength(150) name: string;
  @IsIn(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']) mime: string;
  @IsString() @MaxLength(8000000) data: string;
}
export class TranslationsDto {
  @IsString() @MaxLength(12000) nl: string;
  @IsString() @MaxLength(12000) en: string;
  @IsString() @MaxLength(12000) fr: string;
  @IsString() @MaxLength(12000) de: string;
}
export class CreateDraftDto {
  @IsString() @MaxLength(120) title: string;
  @IsString() @Matches(/^(?:[A-HJ-NPR-Z0-9]{17})?$/) vin: string;
  @IsString() @MaxLength(15000) notes: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(1500000, { each: true }) photos: string[];
  @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => AttachmentDto) documents: AttachmentDto[];
}
export class UpdateDraftDto extends CreateDraftDto {
  @IsInt() @Min(1) revision: number;
  @IsArray() @ArrayMaxSize(13) @ValidateNested({ each: true }) @Type(() => FactDto) facts: FactDto[];
  @IsString() @MaxLength(80) reference: string;
  @IsNumber() @Min(0) @Max(10000000) price: number;
  @IsDefined() @ValidateNested() @Type(() => TranslationsDto) texts: TranslationsDto;
}
export class RevisionDto {
  @IsInt() @Min(1) revision: number;
}
export class PublishDto extends RevisionDto {
  @IsBoolean() approved: boolean;
}
