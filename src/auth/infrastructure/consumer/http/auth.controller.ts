import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterUseCase } from '@auth/application/use-cases/register.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { EmailAlreadyExistsError } from '@auth/domain/errors/email-already-exists.error';
import { InvalidCredentialsError } from '@auth/domain/errors/invalid-credentials.error';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import { UserId } from '@auth/domain/value-objects/user-id';
import { JwtAuthGuard } from '../../security/jwt-auth.guard';
import { CurrentUser } from '../../security/current-user.decorator';
import { RegisterRequestDto } from './dto/register.request';
import { LoginRequestDto } from './dto/login.request';
import type { AuthenticatedUser } from '@shared/auth/authenticated-user';

interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; createdAt: string };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterRequestDto): Promise<AuthResponse> {
    try {
      const result = await this.registerUseCase.execute(dto);
      const token = this.signToken(result.id, result.email);
      return {
        accessToken: token,
        user: { id: result.id, email: result.email, createdAt: result.createdAt.toISOString() },
      };
    } catch (err) {
      if (err instanceof EmailAlreadyExistsError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginRequestDto): Promise<AuthResponse> {
    try {
      const result = await this.loginUseCase.execute(dto);
      const token = this.signToken(result.id, result.email);
      return {
        accessToken: token,
        user: { id: result.id, email: result.email, createdAt: result.createdAt.toISOString() },
      };
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<{ id: string; email: string; createdAt: string }> {
    const user = await this.userRepository.findById(UserId.create(authUser.id));
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return {
      id: user.id.value,
      email: user.email.value,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }
}
