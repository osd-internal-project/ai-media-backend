export class JoinRoomDto {
    projectId: string;
    type: 'video' | 'image';
}

export class LeaveRoomDto {
    projectId: string;
    type: 'video' | 'image';
}

export class SendMessageDto {
    projectId: string;
    type: 'video' | 'image';
    message: string;
    senderId?: string; // Optional, can be inferred from socket or token if needed
    senderName?: string;
    senderAvatar?: string;
}
