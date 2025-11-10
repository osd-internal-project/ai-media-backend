import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class UserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['authorization'];
    if (token) {
      request.body['sub'] = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      ).sub;
    } else {
      throw new ForbiddenException('No Auth');
    }
    return next.handle();
  }
}
