export class JoinRoomDto {
    projectId: string;
    type?: 'video' | 'image' | 'omnihumen' | 'dreamactor';
}

export class LeaveRoomDto {
    projectId: string;
    type?: 'video' | 'image' | 'omnihumen' | 'dreamactor';
}

export class SendMessageDto {
    projectId: string;
    type: 'video' | 'image';
    message: string;
    senderId?: string; // Optional, can be inferred from socket or token if needed
    senderName?: string;
    senderAvatar?: string;
}
