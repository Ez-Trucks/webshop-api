import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePartDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(1)
  partNumber: string;

  @IsString()
  model: string;

  @IsString()
  category: string;

  @IsIn(['used', 'new'])
  condition: 'used' | 'new';

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  image?: string;
}