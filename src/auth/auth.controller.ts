import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class RegisterDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto.username, dto.password);

    if (!result) {
      throw new UnauthorizedException('Login mislukt');
    }

    return result;
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.name, dto.email, dto.password);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const user = token ? this.authService.getUserFromToken(token) : null;

    if (!user) {
      throw new UnauthorizedException('Login vereist');
    }

    return { user };
  }
}
