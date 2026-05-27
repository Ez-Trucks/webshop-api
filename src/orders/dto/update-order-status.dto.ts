import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['pending', 'paid', 'shipped'])
  status: 'pending' | 'paid' | 'shipped';
}