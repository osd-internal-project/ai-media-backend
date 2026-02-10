import { TosClientError, TosServerError } from '@volcengine/tos-sdk';
export function handleError(error) {
    if (error instanceof TosClientError) {
        console.log('Client Err Msg:', error.message);
        console.log('Client Err Stack:', error.stack);
    } else if (error instanceof TosServerError) {
        console.log('Request ID:', error.requestId);
        console.log('Response Status Code:', error.statusCode);
        console.log('Response Header:', error.headers);
        console.log('Response Err Code:', error.code);
        console.log('Response Err Msg:', error.message);
    } else {
        console.log('unexpected exception, message: ', error);
    }
}