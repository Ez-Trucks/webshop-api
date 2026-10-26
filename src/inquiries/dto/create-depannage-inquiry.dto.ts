import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDepannageInquiryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsString()
  @MinLength(3)
  location: string;

  @IsString()
  @MinLength(3)
  vehicleInfo: string;

  @IsIn(['Vandaag', 'Deze week', 'Niet dringend'])
  urgency: 'Vandaag' | 'Deze week' | 'Niet dringend';

  @IsOptional()
  @IsString()
  message?: string;
}
