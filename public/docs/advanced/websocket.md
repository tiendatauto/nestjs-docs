# 🚀 WebSocket trong NestJS

## 🔍 WebSocket là gì?

WebSocket là protocol communication real-time cho phép bidirectional data flow giữa client và server:

- **Vai trò chính**: Enable real-time communication như chat, notifications, live updates
- **Cách hoạt động**: Persistent connection → bidirectional messaging → real-time data flow
- **Execution order**: Connection establishment → Authentication → Event handling → Data exchange
- **Lifecycle**: Connect → Authenticate → Subscribe to rooms → Handle events → Disconnect

> 💡 **Tại sao cần WebSocket?**
> WebSocket cho phép server "push" data đến client instantly thay vì client phải polling liên tục. Giảm latency từ 1000ms (HTTP polling) xuống còn <10ms.

**NestJS WebSocket** features:

- Socket.io integration out-of-the-box
- Decorator-based event handling
- Room và namespace support
- Middleware và guard integration
- Redis adapter cho scaling

## 🎯 Cách implement WebSocket

### Basic Setup

#### 1. Installation & Dependencies

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install --save-dev @types/socket.io
```

#### 2. Basic WebSocket Gateway

```typescript
// src/websocket/websocket.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Socket, Server } from 'socket.io'

@WebSocketGateway({
  cors: {
    origin: '*', // Configure properly in production
  },
})
export class WebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private logger = new Logger(WebSocketGateway.name)
  private server: Server

  afterInit(server: Server) {
    this.server = server
    this.logger.log('WebSocket Gateway initialized')
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`)

    // Send welcome message
    client.emit('welcome', {
      message: 'Connected to server successfully',
      clientId: client.id,
      timestamp: new Date().toISOString(),
    })
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`)
  }

  // Handle incoming messages
  @SubscribeMessage('message')
  handleMessage(@MessageBody() data: { text: string; room?: string }, @ConnectedSocket() client: Socket) {
    this.logger.log(`Message received from ${client.id}: ${data.text}`)

    // Echo message back to sender
    client.emit('message', {
      id: Date.now(),
      text: data.text,
      sender: client.id,
      timestamp: new Date().toISOString(),
    })

    // Broadcast to room if specified
    if (data.room) {
      client.to(data.room).emit('message', {
        id: Date.now(),
        text: data.text,
        sender: client.id,
        timestamp: new Date().toISOString(),
        room: data.room,
      })
    }

    return { status: 'ok', received: data.text }
  }

  // Join room
  @SubscribeMessage('join-room')
  handleJoinRoom(@MessageBody() data: { room: string }, @ConnectedSocket() client: Socket) {
    client.join(data.room)
    this.logger.log(`Client ${client.id} joined room: ${data.room}`)

    // Notify room members
    client.to(data.room).emit('user-joined', {
      userId: client.id,
      room: data.room,
      timestamp: new Date().toISOString(),
    })

    return { status: 'joined', room: data.room }
  }

  // Leave room
  @SubscribeMessage('leave-room')
  handleLeaveRoom(@MessageBody() data: { room: string }, @ConnectedSocket() client: Socket) {
    client.leave(data.room)
    this.logger.log(`Client ${client.id} left room: ${data.room}`)

    // Notify room members
    client.to(data.room).emit('user-left', {
      userId: client.id,
      room: data.room,
      timestamp: new Date().toISOString(),
    })

    return { status: 'left', room: data.room }
  }
}
```

#### 3. WebSocket Module Setup

```typescript
// src/websocket/websocket.module.ts
import { Module } from '@nestjs/common'
import { WebSocketGateway } from './websocket.gateway'

@Module({
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketModule {}
```

#### 4. Register trong App Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common'
import { WebSocketModule } from './websocket/websocket.module'

@Module({
  imports: [
    // ... other modules
    WebSocketModule,
  ],
})
export class AppModule {}
```

### Basic Client Implementation

#### 1. Frontend Client (JavaScript/TypeScript)

```typescript
// client/websocket-client.ts
import { io, Socket } from 'socket.io-client'

class WebSocketClient {
  private socket: Socket
  private connected = false

  constructor(serverUrl: string = 'http://localhost:3000') {
    this.socket = io(serverUrl, {
      autoConnect: false,
    })

    this.setupEventListeners()
  }

  private setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server:', this.socket.id)
      this.connected = true
    })

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server')
      this.connected = false
    })

    this.socket.on('welcome', (data) => {
      console.log('Welcome message:', data)
    })

    this.socket.on('message', (data) => {
      console.log('Message received:', data)
      this.displayMessage(data)
    })

    this.socket.on('user-joined', (data) => {
      console.log('User joined room:', data)
    })

    this.socket.on('user-left', (data) => {
      console.log('User left room:', data)
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
    })
  }

  connect() {
    if (!this.connected) {
      this.socket.connect()
    }
  }

  disconnect() {
    if (this.connected) {
      this.socket.disconnect()
    }
  }

  sendMessage(text: string, room?: string) {
    if (this.connected) {
      this.socket.emit('message', { text, room })
    } else {
      console.warn('Not connected to server')
    }
  }

  joinRoom(room: string) {
    if (this.connected) {
      this.socket.emit('join-room', { room })
    }
  }

  leaveRoom(room: string) {
    if (this.connected) {
      this.socket.emit('leave-room', { room })
    }
  }

  private displayMessage(data: any) {
    // Implementation for displaying message in UI
    const messageElement = document.createElement('div')
    messageElement.innerHTML = `
      <strong>${data.sender}:</strong> ${data.text}
      <small>(${new Date(data.timestamp).toLocaleTimeString()})</small>
    `
    document.getElementById('messages')?.appendChild(messageElement)
  }
}

// Usage example
const wsClient = new WebSocketClient()
wsClient.connect()

// Send message
document.getElementById('send-btn')?.addEventListener('click', () => {
  const input = document.getElementById('message-input') as HTMLInputElement
  const roomInput = document.getElementById('room-input') as HTMLInputElement

  if (input.value.trim()) {
    wsClient.sendMessage(input.value, roomInput.value || undefined)
    input.value = ''
  }
})

// Join room
document.getElementById('join-room-btn')?.addEventListener('click', () => {
  const roomInput = document.getElementById('room-input') as HTMLInputElement

  if (roomInput.value.trim()) {
    wsClient.joinRoom(roomInput.value)
  }
})
```

#### 2. HTML Client Example

```html
<!-- client/index.html -->
<!DOCTYPE html>
<html>
  <head>
    <title>WebSocket Chat Example</title>
    <script src="https://cdn.socket.io/4.0.0/socket.io.min.js"></script>
  </head>
  <body>
    <div>
      <h1>WebSocket Chat</h1>

      <div>
        <input type="text" id="room-input" placeholder="Room name" />
        <button id="join-room-btn">Join Room</button>
        <button id="leave-room-btn">Leave Room</button>
      </div>

      <div
        id="messages"
        style="height: 300px; overflow-y: scroll; border: 1px solid #ccc; padding: 10px; margin: 10px 0;"
      ></div>

      <div>
        <input type="text" id="message-input" placeholder="Type your message..." style="width: 70%;" />
        <button id="send-btn">Send</button>
      </div>

      <div>
        <button id="connect-btn">Connect</button>
        <button id="disconnect-btn">Disconnect</button>
      </div>
    </div>

    <script>
      // Initialize WebSocket connection
      const socket = io('http://localhost:3000', {
        autoConnect: false,
      })

      // Event listeners
      socket.on('connect', () => {
        console.log('Connected:', socket.id)
        addMessage('System: Connected to server')
      })

      socket.on('disconnect', () => {
        console.log('Disconnected')
        addMessage('System: Disconnected from server')
      })

      socket.on('welcome', (data) => {
        addMessage(`System: ${data.message}`)
      })

      socket.on('message', (data) => {
        addMessage(`${data.sender}: ${data.text}`)
      })

      socket.on('user-joined', (data) => {
        addMessage(`System: User ${data.userId} joined room ${data.room}`)
      })

      socket.on('user-left', (data) => {
        addMessage(`System: User ${data.userId} left room ${data.room}`)
      })

      // UI functions
      function addMessage(message) {
        const messagesDiv = document.getElementById('messages')
        const messageDiv = document.createElement('div')
        messageDiv.innerHTML = `<div>${message} <small>(${new Date().toLocaleTimeString()})</small></div>`
        messagesDiv.appendChild(messageDiv)
        messagesDiv.scrollTop = messagesDiv.scrollHeight
      }

      // Button event listeners
      document.getElementById('connect-btn').addEventListener('click', () => {
        socket.connect()
      })

      document.getElementById('disconnect-btn').addEventListener('click', () => {
        socket.disconnect()
      })

      document.getElementById('send-btn').addEventListener('click', () => {
        const messageInput = document.getElementById('message-input')
        const roomInput = document.getElementById('room-input')

        if (messageInput.value.trim()) {
          socket.emit('message', {
            text: messageInput.value,
            room: roomInput.value || undefined,
          })
          messageInput.value = ''
        }
      })

      document.getElementById('join-room-btn').addEventListener('click', () => {
        const roomInput = document.getElementById('room-input')

        if (roomInput.value.trim()) {
          socket.emit('join-room', { room: roomInput.value })
        }
      })

      document.getElementById('leave-room-btn').addEventListener('click', () => {
        const roomInput = document.getElementById('room-input')

        if (roomInput.value.trim()) {
          socket.emit('leave-room', { room: roomInput.value })
        }
      })

      // Allow Enter key to send message
      document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('send-btn').click()
        }
      })
    </script>
  </body>
</html>
```

**Input/Output Example:**

```typescript
// Server receives:
{
  text: "Hello everyone!",
  room: "general"
}

// Server emits to room members:
{
  id: 1693497600000,
  text: "Hello everyone!",
  sender: "socket_abc123",
  timestamp: "2025-08-31T10:00:00.000Z",
  room: "general"
}

// Console output:
// [WebSocketGateway] Client connected: socket_abc123
// [WebSocketGateway] Message received from socket_abc123: Hello everyone!
// [WebSocketGateway] Client socket_abc123 joined room: general
```

## 💡 Các cách sử dụng thông dụng

### 1. Real-time Chat Application

```typescript
// src/chat/chat.gateway.ts
import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets'
import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WsAuthGuard } from '../auth/ws-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { CreateMessageDto } from './dto/create-message.dto'
import { ChatService } from './chat.service'

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard)
@UsePipes(new ValidationPipe())
export class ChatGateway {
  @WebSocketServer()
  server: Server

  constructor(private chatService: ChatService) {}

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @MessageBody() createMessageDto: CreateMessageDto,
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Save message to database
      const message = await this.chatService.createMessage({
        ...createMessageDto,
        userId: user.id,
        username: user.username,
      })

      // Emit to room members
      this.server.to(createMessageDto.roomId).emit('new-message', {
        id: message.id,
        text: message.text,
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        },
        createdAt: message.createdAt,
        roomId: createMessageDto.roomId,
      })

      // Update room last activity
      await this.chatService.updateRoomActivity(createMessageDto.roomId)

      return { status: 'success', messageId: message.id }
    } catch (error) {
      client.emit('error', {
        event: 'send-message',
        message: error.message,
      })

      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Check if user has permission to join room
      const canJoin = await this.chatService.checkRoomPermission(user.id, data.roomId)

      if (!canJoin) {
        client.emit('error', {
          event: 'join-room',
          message: 'No permission to join this room',
        })
        return { status: 'error', message: 'Access denied' }
      }

      // Join socket room
      await client.join(data.roomId)

      // Update user's active rooms
      await this.chatService.addUserToRoom(user.id, data.roomId)

      // Load recent messages
      const recentMessages = await this.chatService.getRecentMessages(data.roomId, 20)

      // Send recent messages to user
      client.emit('room-messages', {
        roomId: data.roomId,
        messages: recentMessages,
      })

      // Notify room members
      client.to(data.roomId).emit('user-joined-room', {
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        },
        roomId: data.roomId,
        timestamp: new Date().toISOString(),
      })

      return { status: 'success', roomId: data.roomId }
    } catch (error) {
      client.emit('error', {
        event: 'join-room',
        message: error.message,
      })

      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Leave socket room
      await client.leave(data.roomId)

      // Update user's active rooms
      await this.chatService.removeUserFromRoom(user.id, data.roomId)

      // Notify room members
      client.to(data.roomId).emit('user-left-room', {
        user: {
          id: user.id,
          username: user.username,
        },
        roomId: data.roomId,
        timestamp: new Date().toISOString(),
      })

      return { status: 'success', roomId: data.roomId }
    } catch (error) {
      client.emit('error', {
        event: 'leave-room',
        message: error.message,
      })

      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('typing-start')
  handleTypingStart(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    client.to(data.roomId).emit('user-typing', {
      user: {
        id: user.id,
        username: user.username,
      },
      roomId: data.roomId,
      typing: true,
    })
  }

  @SubscribeMessage('typing-stop')
  handleTypingStop(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    client.to(data.roomId).emit('user-typing', {
      user: {
        id: user.id,
        username: user.username,
      },
      roomId: data.roomId,
      typing: false,
    })
  }
}
```

### 2. Real-time Notifications System

```typescript
// src/notifications/notifications.gateway.ts
import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, WebSocketServer } from '@nestjs/websockets'
import { Logger, UseGuards } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WsAuthGuard } from '../auth/ws-auth.guard'
import { NotificationService } from './notification.service'
import { SocketService } from '../websocket/socket.service'

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard)
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(NotificationsGateway.name)

  constructor(
    private notificationService: NotificationService,
    private socketService: SocketService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const user = client.data.user // Set by auth guard

      this.logger.log(`User ${user.id} connected to notifications`)

      // Store socket connection
      await this.socketService.addUserSocket(user.id, client.id, 'notifications')

      // Join user-specific room
      await client.join(`user:${user.id}`)

      // Send unread notifications count
      const unreadCount = await this.notificationService.getUnreadCount(user.id)
      client.emit('unread-count', { count: unreadCount })

      // Send recent notifications
      const recentNotifications = await this.notificationService.getRecentNotifications(user.id, 10)

      client.emit('recent-notifications', {
        notifications: recentNotifications,
      })
    } catch (error) {
      this.logger.error(`Connection error for ${client.id}:`, error)
      client.emit('error', { message: 'Connection failed' })
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const user = client.data.user

      if (user) {
        this.logger.log(`User ${user.id} disconnected from notifications`)

        // Remove socket connection
        await this.socketService.removeUserSocket(user.id, client.id)
      }
    } catch (error) {
      this.logger.error(`Disconnect error for ${client.id}:`, error)
    }
  }

  // Method để send notification từ other services
  async sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('new-notification', notification)

    // Update unread count
    const unreadCount = await this.notificationService.getUnreadCount(userId)
    this.server.to(`user:${userId}`).emit('unread-count', { count: unreadCount })
  }

  // Broadcast notification to multiple users
  async sendNotificationToUsers(userIds: string[], notification: any) {
    const promises = userIds.map((userId) => this.sendNotificationToUser(userId, notification))

    await Promise.all(promises)
  }

  // Send notification to all users in a role/group
  async sendNotificationToRole(role: string, notification: any) {
    this.server.emit('role-notification', {
      role,
      notification,
    })
  }
}
```

### 3. Live Order Tracking

```typescript
// src/orders/order-tracking.gateway.ts
import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets'
import { UseGuards } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WsAuthGuard } from '../auth/ws-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { OrderService } from './order.service'

@WebSocketGateway({
  namespace: '/order-tracking',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard)
export class OrderTrackingGateway {
  @WebSocketServer()
  server: Server

  constructor(private orderService: OrderService) {}

  @SubscribeMessage('track-order')
  async handleTrackOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Verify user can track this order
      const order = await this.orderService.findOrderById(data.orderId)

      if (!order || order.userId !== user.id) {
        client.emit('error', {
          event: 'track-order',
          message: 'Order not found or access denied',
        })
        return { status: 'error', message: 'Access denied' }
      }

      // Join order-specific room
      await client.join(`order:${data.orderId}`)

      // Send current order status
      client.emit('order-status', {
        orderId: data.orderId,
        status: order.status,
        statusHistory: order.statusHistory,
        estimatedDelivery: order.estimatedDelivery,
        trackingNumber: order.trackingNumber,
        location: order.currentLocation,
      })

      return { status: 'success', orderId: data.orderId }
    } catch (error) {
      client.emit('error', {
        event: 'track-order',
        message: error.message,
      })

      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('stop-tracking')
  async handleStopTracking(@MessageBody() data: { orderId: string }, @ConnectedSocket() client: Socket) {
    await client.leave(`order:${data.orderId}`)
    return { status: 'success', message: 'Stopped tracking order' }
  }

  // Method để update order status từ backend
  async updateOrderStatus(orderId: string, status: string, data: any = {}) {
    const updateData = {
      orderId,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    }

    // Emit to all clients tracking this order
    this.server.to(`order:${orderId}`).emit('order-status-updated', updateData)

    // Also send to user-specific room for global notifications
    const order = await this.orderService.findOrderById(orderId)
    if (order) {
      this.server.to(`user:${order.userId}`).emit('order-notification', {
        type: 'status-update',
        orderId,
        status,
        message: this.getStatusMessage(status),
        ...data,
      })
    }
  }

  private getStatusMessage(status: string): string {
    const messages = {
      confirmed: 'Your order has been confirmed',
      preparing: 'Your order is being prepared',
      shipped: 'Your order has been shipped',
      'out-for-delivery': 'Your order is out for delivery',
      delivered: 'Your order has been delivered',
      cancelled: 'Your order has been cancelled',
    }

    return messages[status] || `Order status updated to ${status}`
  }
}
```

---

**Đây là Giai đoạn 1**. Tiếp theo tôi sẽ tạo **Giai đoạn 2**: Authentication, Namespace và Advanced Patterns. Bạn có muốn tôi tiếp tục không?

## 🔧 Authentication và Authorization

### WebSocket Authentication Guard

```typescript
// src/auth/ws-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Socket } from 'socket.io'
import { AuthService } from './auth.service'

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name)

  constructor(
    private jwtService: JwtService,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient()
      const token = this.extractTokenFromSocket(client)

      if (!token) {
        this.logger.warn(`No token provided for socket ${client.id}`)
        client.emit('auth-error', { message: 'Authentication required' })
        client.disconnect(true)
        return false
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token)

      // Get user details
      const user = await this.authService.findUserById(payload.sub)

      if (!user || !user.isActive) {
        this.logger.warn(`Invalid user or inactive for socket ${client.id}`)
        client.emit('auth-error', { message: 'Invalid authentication' })
        client.disconnect(true)
        return false
      }

      // Store user data trong socket
      client.data.user = user
      client.data.userId = user.id

      this.logger.log(`User ${user.id} authenticated for socket ${client.id}`)
      return true
    } catch (error) {
      this.logger.error(`Authentication failed for socket:`, error)
      const client: Socket = context.switchToWs().getClient()
      client.emit('auth-error', { message: 'Authentication failed' })
      client.disconnect(true)
      return false
    }
  }

  private extractTokenFromSocket(client: Socket): string | null {
    // Method 1: From handshake auth
    const authHeader = client.handshake.auth?.token
    if (authHeader) {
      return authHeader
    }

    // Method 2: From query parameters
    const queryToken = client.handshake.query?.token as string
    if (queryToken) {
      return queryToken
    }

    // Method 3: From headers
    const headerAuth = client.handshake.headers?.authorization
    if (headerAuth && headerAuth.startsWith('Bearer ')) {
      return headerAuth.substring(7)
    }

    return null
  }
}
```

### Role-based WebSocket Guard

```typescript
// src/auth/ws-roles.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Socket } from 'socket.io'
import { ROLES_KEY } from './roles.decorator'

@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles) {
      return true
    }

    const client: Socket = context.switchToWs().getClient()
    const user = client.data.user

    if (!user) {
      client.emit('auth-error', { message: 'Authentication required' })
      return false
    }

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role))

    if (!hasRole) {
      client.emit('auth-error', {
        message: 'Insufficient permissions',
        requiredRoles,
        userRoles: user.roles,
      })
      return false
    }

    return true
  }
}
```

### Socket Service for User Management

```typescript
// src/websocket/socket.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Redis } from 'ioredis'

interface UserSocket {
  userId: string
  socketId: string
  namespace: string
  connectedAt: Date
  lastActivity: Date
}

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name)
  private readonly socketPrefix = 'socket:'
  private readonly userSocketsPrefix = 'user-sockets:'

  constructor(private redis: Redis) {}

  // Store user socket connection
  async addUserSocket(userId: string, socketId: string, namespace: string): Promise<void> {
    const socketData: UserSocket = {
      userId,
      socketId,
      namespace,
      connectedAt: new Date(),
      lastActivity: new Date(),
    }

    // Store socket data
    await this.redis.hset(
      `${this.socketPrefix}${socketId}`,
      'userId',
      userId,
      'namespace',
      namespace,
      'connectedAt',
      socketData.connectedAt.toISOString(),
      'lastActivity',
      socketData.lastActivity.toISOString(),
    )

    // Add to user's socket list
    await this.redis.sadd(`${this.userSocketsPrefix}${userId}`, socketId)

    // Set expiration (cleanup stale connections)
    await this.redis.expire(`${this.socketPrefix}${socketId}`, 24 * 60 * 60) // 24 hours

    this.logger.log(`Socket ${socketId} added for user ${userId} in namespace ${namespace}`)
  }

  // Remove user socket connection
  async removeUserSocket(userId: string, socketId: string): Promise<void> {
    // Remove socket data
    await this.redis.del(`${this.socketPrefix}${socketId}`)

    // Remove from user's socket list
    await this.redis.srem(`${this.userSocketsPrefix}${userId}`, socketId)

    this.logger.log(`Socket ${socketId} removed for user ${userId}`)
  }

  // Get all sockets for a user
  async getUserSockets(userId: string): Promise<string[]> {
    return await this.redis.smembers(`${this.userSocketsPrefix}${userId}`)
  }

  // Check if user is online
  async isUserOnline(userId: string): Promise<boolean> {
    const sockets = await this.getUserSockets(userId)
    return sockets.length > 0
  }

  // Get online users count
  async getOnlineUsersCount(): Promise<number> {
    const keys = await this.redis.keys(`${this.userSocketsPrefix}*`)
    let onlineCount = 0

    for (const key of keys) {
      const sockets = await this.redis.smembers(key)
      if (sockets.length > 0) {
        onlineCount++
      }
    }

    return onlineCount
  }

  // Update user activity
  async updateUserActivity(socketId: string): Promise<void> {
    await this.redis.hset(`${this.socketPrefix}${socketId}`, 'lastActivity', new Date().toISOString())
  }

  // Get socket info
  async getSocketInfo(socketId: string): Promise<UserSocket | null> {
    const data = await this.redis.hgetall(`${this.socketPrefix}${socketId}`)

    if (!data.userId) {
      return null
    }

    return {
      userId: data.userId,
      socketId,
      namespace: data.namespace,
      connectedAt: new Date(data.connectedAt),
      lastActivity: new Date(data.lastActivity),
    }
  }

  // Cleanup stale connections
  async cleanupStaleConnections(): Promise<void> {
    const keys = await this.redis.keys(`${this.socketPrefix}*`)
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000) // 30 minutes

    for (const key of keys) {
      const lastActivity = await this.redis.hget(key, 'lastActivity')

      if (lastActivity && new Date(lastActivity) < staleThreshold) {
        const socketId = key.replace(this.socketPrefix, '')
        const userId = await this.redis.hget(key, 'userId')

        if (userId) {
          await this.removeUserSocket(userId, socketId)
          this.logger.log(`Cleaned up stale connection: ${socketId}`)
        }
      }
    }
  }
}
```

## 🎯 Namespace Implementation

### Multiple Namespaces Setup

```typescript
// src/websocket/namespaces/chat.gateway.ts
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { UseGuards } from '@nestjs/common'
import { Server } from 'socket.io'
import { WsAuthGuard } from '../../auth/ws-auth.guard'
import { BaseGateway } from '../base.gateway'

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard)
export class ChatGateway extends BaseGateway {
  @WebSocketServer()
  server: Server

  constructor() {
    super('chat')
  }

  getNamespace(): string {
    return '/chat'
  }
}

// src/websocket/namespaces/notifications.gateway.ts
@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard)
export class NotificationsGateway extends BaseGateway {
  @WebSocketServer()
  server: Server

  constructor() {
    super('notifications')
  }

  getNamespace(): string {
    return '/notifications'
  }
}

// src/websocket/namespaces/admin.gateway.ts
@WebSocketGateway({
  namespace: '/admin',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard, WsRolesGuard)
@Roles('admin', 'moderator')
export class AdminGateway extends BaseGateway {
  @WebSocketServer()
  server: Server

  constructor() {
    super('admin')
  }

  getNamespace(): string {
    return '/admin'
  }

  // Admin-specific events
  @SubscribeMessage('broadcast-message')
  async handleBroadcastMessage(
    @MessageBody() data: { message: string; type: 'info' | 'warning' | 'error' },
    @CurrentUser() user: any,
  ) {
    // Broadcast to all namespaces
    const namespaces = ['/chat', '/notifications', '/admin']

    for (const namespace of namespaces) {
      this.server.of(namespace).emit('admin-broadcast', {
        message: data.message,
        type: data.type,
        from: user.username,
        timestamp: new Date().toISOString(),
      })
    }

    return { status: 'success', message: 'Broadcast sent' }
  }

  @SubscribeMessage('get-online-users')
  async handleGetOnlineUsers() {
    const onlineCount = await this.socketService.getOnlineUsersCount()

    return {
      status: 'success',
      data: {
        onlineUsersCount: onlineCount,
        timestamp: new Date().toISOString(),
      },
    }
  }
}
```

### Base Gateway Class

```typescript
// src/websocket/base.gateway.ts
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Logger, UseGuards } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WsAuthGuard } from '../auth/ws-auth.guard'
import { SocketService } from './socket.service'
import { CurrentUser } from '../auth/current-user.decorator'

@UseGuards(WsAuthGuard)
export abstract class BaseGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  protected readonly logger: Logger
  protected server: Server

  constructor(
    protected namespace: string,
    protected socketService?: SocketService,
  ) {
    this.logger = new Logger(`${this.constructor.name}`)
  }

  abstract getNamespace(): string

  afterInit(server: Server) {
    this.server = server
    this.logger.log(`${this.namespace} namespace initialized`)
  }

  async handleConnection(client: Socket) {
    try {
      const user = client.data.user

      if (user) {
        this.logger.log(`User ${user.id} connected to ${this.namespace} namespace`)

        // Store socket connection
        if (this.socketService) {
          await this.socketService.addUserSocket(user.id, client.id, this.namespace)
        }

        // Join user-specific room
        await client.join(`user:${user.id}`)

        // Send connection confirmation
        client.emit('connected', {
          namespace: this.namespace,
          userId: user.id,
          socketId: client.id,
          timestamp: new Date().toISOString(),
        })

        // Call namespace-specific connection handler
        await this.onUserConnected(client, user)
      }
    } catch (error) {
      this.logger.error(`Connection error in ${this.namespace}:`, error)
      client.emit('error', { message: 'Connection failed' })
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const user = client.data.user

      if (user) {
        this.logger.log(`User ${user.id} disconnected from ${this.namespace} namespace`)

        // Remove socket connection
        if (this.socketService) {
          await this.socketService.removeUserSocket(user.id, client.id)
        }

        // Call namespace-specific disconnect handler
        await this.onUserDisconnected(client, user)
      }
    } catch (error) {
      this.logger.error(`Disconnect error in ${this.namespace}:`, error)
    }
  }

  // Default ping/pong để check connection health
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    if (this.socketService) {
      this.socketService.updateUserActivity(client.id)
    }

    return { type: 'pong', timestamp: new Date().toISOString() }
  }

  // Get user's active rooms
  @SubscribeMessage('get-rooms')
  handleGetRooms(@ConnectedSocket() client: Socket) {
    const rooms = Array.from(client.rooms).filter((room) => room !== client.id)

    return {
      status: 'success',
      rooms,
    }
  }

  // Override these methods in child classes
  protected async onUserConnected(client: Socket, user: any): Promise<void> {
    // Default implementation - can be overridden
  }

  protected async onUserDisconnected(client: Socket, user: any): Promise<void> {
    // Default implementation - can be overridden
  }

  // Utility methods for child classes
  protected async emitToUser(userId: string, event: string, data: any): Promise<void> {
    this.server.to(`user:${userId}`).emit(event, data)
  }

  protected async emitToRoom(roomId: string, event: string, data: any): Promise<void> {
    this.server.to(roomId).emit(event, data)
  }

  protected async emitToNamespace(event: string, data: any): Promise<void> {
    this.server.emit(event, data)
  }
}
```

### Cross-Namespace Communication

```typescript
// src/websocket/namespace-manager.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Server } from 'socket.io'

@Injectable()
export class NamespaceManagerService {
  private readonly logger = new Logger(NamespaceManagerService.name)
  private server: Server

  setServer(server: Server) {
    this.server = server
  }

  // Send message to specific user across all namespaces
  async sendToUserAllNamespaces(userId: string, event: string, data: any): Promise<void> {
    const namespaces = ['/chat', '/notifications', '/admin']

    for (const namespace of namespaces) {
      this.server.of(namespace).to(`user:${userId}`).emit(event, data)
    }

    this.logger.log(`Sent event '${event}' to user ${userId} across all namespaces`)
  }

  // Broadcast to all namespaces
  async broadcastToAllNamespaces(event: string, data: any, excludeNamespace?: string): Promise<void> {
    const namespaces = ['/chat', '/notifications', '/admin']

    for (const namespace of namespaces) {
      if (namespace !== excludeNamespace) {
        this.server.of(namespace).emit(event, data)
      }
    }

    this.logger.log(`Broadcasted event '${event}' to all namespaces`)
  }

  // Send to specific namespace
  async sendToNamespace(namespace: string, event: string, data: any): Promise<void> {
    this.server.of(namespace).emit(event, data)
    this.logger.log(`Sent event '${event}' to namespace ${namespace}`)
  }

  // Send to multiple specific users in specific namespace
  async sendToUsersInNamespace(namespace: string, userIds: string[], event: string, data: any): Promise<void> {
    const rooms = userIds.map((id) => `user:${id}`)

    for (const room of rooms) {
      this.server.of(namespace).to(room).emit(event, data)
    }

    this.logger.log(`Sent event '${event}' to ${userIds.length} users in namespace ${namespace}`)
  }

  // Get namespace statistics
  async getNamespaceStats(): Promise<Record<string, any>> {
    const namespaces = ['/chat', '/notifications', '/admin']
    const stats: Record<string, any> = {}

    for (const namespace of namespaces) {
      const nsInstance = this.server.of(namespace)
      const sockets = await nsInstance.fetchSockets()

      stats[namespace] = {
        connectedClients: sockets.length,
        rooms: await this.getNamespaceRooms(namespace),
      }
    }

    return stats
  }

  private async getNamespaceRooms(namespace: string): Promise<string[]> {
    const nsInstance = this.server.of(namespace)
    const adapter = nsInstance.adapter

    return Array.from(adapter.rooms.keys()).filter(
      (room) => !adapter.sids.has(room), // Exclude socket IDs
    )
  }
}
```

**Client-side Namespace Usage:**

```typescript
// client/namespace-client.ts
class MultiNamespaceClient {
  private chatSocket: Socket
  private notificationSocket: Socket
  private adminSocket: Socket | null = null

  constructor(token: string, serverUrl: string = 'http://localhost:3000') {
    const authConfig = {
      auth: { token },
      autoConnect: false,
    }

    // Connect to different namespaces
    this.chatSocket = io(`${serverUrl}/chat`, authConfig)
    this.notificationSocket = io(`${serverUrl}/notifications`, authConfig)

    // Admin socket only for authorized users
    if (this.userHasAdminAccess()) {
      this.adminSocket = io(`${serverUrl}/admin`, authConfig)
    }

    this.setupEventListeners()
  }

  private setupEventListeners() {
    // Chat namespace events
    this.chatSocket.on('connected', (data) => {
      console.log('Connected to chat namespace:', data)
    })

    this.chatSocket.on('new-message', (message) => {
      this.displayChatMessage(message)
    })

    // Notification namespace events
    this.notificationSocket.on('connected', (data) => {
      console.log('Connected to notifications namespace:', data)
    })

    this.notificationSocket.on('new-notification', (notification) => {
      this.showNotification(notification)
    })

    this.notificationSocket.on('unread-count', (data) => {
      this.updateUnreadBadge(data.count)
    })

    // Admin namespace events (if connected)
    if (this.adminSocket) {
      this.adminSocket.on('connected', (data) => {
        console.log('Connected to admin namespace:', data)
      })

      this.adminSocket.on('admin-broadcast', (data) => {
        this.showAdminMessage(data)
      })
    }

    // Common error handling
    this.setupErrorHandling()
  }

  connectAll() {
    this.chatSocket.connect()
    this.notificationSocket.connect()
    if (this.adminSocket) {
      this.adminSocket.connect()
    }
  }

  disconnectAll() {
    this.chatSocket.disconnect()
    this.notificationSocket.disconnect()
    if (this.adminSocket) {
      this.adminSocket.disconnect()
    }
  }

  // Chat methods
  sendChatMessage(roomId: string, text: string) {
    this.chatSocket.emit('send-message', { roomId, text })
  }

  joinChatRoom(roomId: string) {
    this.chatSocket.emit('join-room', { roomId })
  }

  // Admin methods
  broadcastAdminMessage(message: string, type: 'info' | 'warning' | 'error') {
    if (this.adminSocket) {
      this.adminSocket.emit('broadcast-message', { message, type })
    }
  }

  private userHasAdminAccess(): boolean {
    // Check user roles/permissions
    return false // Implementation depends on your auth system
  }

  private setupErrorHandling() {
    const sockets = [this.chatSocket, this.notificationSocket, this.adminSocket].filter(Boolean)

    sockets.forEach((socket) => {
      socket.on('auth-error', (error) => {
        console.error('Authentication error:', error)
        this.handleAuthError(error)
      })

      socket.on('error', (error) => {
        console.error('Socket error:', error)
      })

      socket.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason)
      })
    })
  }

  private displayChatMessage(message: any) {
    // Implementation for displaying chat message
  }

  private showNotification(notification: any) {
    // Implementation for showing notification
  }

  private updateUnreadBadge(count: number) {
    // Implementation for updating notification badge
  }

  private showAdminMessage(data: any) {
    // Implementation for showing admin message
  }

  private handleAuthError(error: any) {
    // Implementation for handling auth errors
    // Redirect to login, refresh token, etc.
  }
}
```

## ⚠️ Custom WebSocket Adapter và Redis Integration

### Redis Adapter Setup for Multiple Servers

```typescript
// src/websocket/redis-adapter.config.ts
import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { ConfigService } from '@nestjs/config'

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>

  constructor(
    app: any,
    private configService: ConfigService,
  ) {
    super(app)
  }

  async connectToRedis(): Promise<void> {
    const pubClient = new Redis({
      host: this.configService.get('redis.host'),
      port: this.configService.get('redis.port'),
      password: this.configService.get('redis.password'),
      db: this.configService.get('redis.websocket_db', 2), // Separate DB for WebSocket
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    })

    const subClient = pubClient.duplicate()

    this.adapterConstructor = createAdapter(pubClient, subClient)
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options)

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor)
    }

    return server
  }
}

// src/main.ts - Setup Redis adapter
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { RedisIoAdapter } from './websocket/redis-adapter.config'
import { ConfigService } from '@nestjs/config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const configService = app.get(ConfigService)

  // Setup Redis adapter for WebSocket scaling
  const redisIoAdapter = new RedisIoAdapter(app, configService)
  await redisIoAdapter.connectToRedis()
  app.useWebSocketAdapter(redisIoAdapter)

  await app.listen(3000)
}
bootstrap()
```

### Custom WebSocket Middleware

```typescript
// src/websocket/middleware/websocket-logger.middleware.ts
import { Injectable, Logger } from '@nestjs/common'
import { Socket } from 'socket.io'

@Injectable()
export class WebSocketLoggerMiddleware {
  private readonly logger = new Logger(WebSocketLoggerMiddleware.name)

  use(socket: Socket, next: (err?: Error) => void) {
    const startTime = Date.now()

    // Log connection attempt
    this.logger.log(`Connection attempt from ${socket.handshake.address}`)

    // Log all events
    const originalEmit = socket.emit
    socket.emit = function (event: string, ...args: any[]) {
      const logger = new Logger('WebSocketEvents')
      logger.debug(`Outgoing event: ${event}`, { socketId: socket.id, args })
      return originalEmit.call(this, event, ...args)
    }

    // Log incoming events
    const originalOn = socket.on
    socket.on = function (event: string, listener: Function) {
      const wrappedListener = (...args: any[]) => {
        const logger = new Logger('WebSocketEvents')
        logger.debug(`Incoming event: ${event}`, { socketId: socket.id, args })
        return listener.apply(this, args)
      }
      return originalOn.call(this, event, wrappedListener)
    }

    // Log connection duration on disconnect
    socket.on('disconnect', (reason) => {
      const duration = Date.now() - startTime
      this.logger.log(`Socket ${socket.id} disconnected after ${duration}ms. Reason: ${reason}`)
    })

    next()
  }
}

// src/websocket/middleware/rate-limit.middleware.ts
import { Injectable, Logger } from '@nestjs/common'
import { Socket } from 'socket.io'
import { Redis } from 'ioredis'

interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  skipSuccessfulRequests?: boolean
  keyGenerator?: (socket: Socket) => string
}

@Injectable()
export class WebSocketRateLimitMiddleware {
  private readonly logger = new Logger(WebSocketRateLimitMiddleware.name)

  constructor(
    private redis: Redis,
    private options: RateLimitOptions,
  ) {}

  use(socket: Socket, next: (err?: Error) => void) {
    const key = this.options.keyGenerator ? this.options.keyGenerator(socket) : this.getDefaultKey(socket)

    // Wrap socket event handlers with rate limiting
    this.wrapSocketEvents(socket, key)

    next()
  }

  private async checkRateLimit(key: string): Promise<boolean> {
    const current = await this.redis.incr(key)

    if (current === 1) {
      // First request in window, set expiration
      await this.redis.expire(key, Math.ceil(this.options.windowMs / 1000))
    }

    return current <= this.options.maxRequests
  }

  private wrapSocketEvents(socket: Socket, rateLimitKey: string) {
    const originalOn = socket.on.bind(socket)

    socket.on = (event: string, listener: Function) => {
      const wrappedListener = async (...args: any[]) => {
        // Skip rate limiting for certain events
        if (['disconnect', 'error', 'connect'].includes(event)) {
          return listener.apply(socket, args)
        }

        const allowed = await this.checkRateLimit(`${rateLimitKey}:${event}`)

        if (!allowed) {
          this.logger.warn(`Rate limit exceeded for socket ${socket.id} on event ${event}`)
          socket.emit('rate-limit-exceeded', {
            event,
            message: 'Too many requests',
            retryAfter: Math.ceil(this.options.windowMs / 1000),
          })
          return
        }

        return listener.apply(socket, args)
      }

      return originalOn(event, wrappedListener)
    }
  }

  private getDefaultKey(socket: Socket): string {
    // Use user ID if available, otherwise use IP address
    const userId = socket.data?.user?.id
    const ip = socket.handshake.address

    return userId ? `rate-limit:user:${userId}` : `rate-limit:ip:${ip}`
  }
}

// src/websocket/middleware/auth-session.middleware.ts
import { Injectable, Logger } from '@nestjs/common'
import { Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthSessionMiddleware {
  private readonly logger = new Logger(AuthSessionMiddleware.name)

  constructor(private jwtService: JwtService) {}

  use(socket: Socket, next: (err?: Error) => void) {
    try {
      // Extract token from various sources
      const token = this.extractToken(socket)

      if (!token) {
        return next(new Error('Authentication token required'))
      }

      // Verify token
      const payload = this.jwtService.verify(token)

      // Store user info in socket data
      socket.data.user = payload
      socket.data.userId = payload.sub

      // Set up token refresh logic
      this.setupTokenRefresh(socket, token)

      this.logger.log(`User ${payload.sub} authenticated for socket ${socket.id}`)
      next()
    } catch (error) {
      this.logger.error(`Authentication failed for socket ${socket.id}:`, error)
      next(new Error('Invalid authentication token'))
    }
  }

  private extractToken(socket: Socket): string | null {
    // Try multiple token sources
    const sources = [
      socket.handshake.auth?.token,
      socket.handshake.query?.token,
      socket.handshake.headers?.authorization?.replace('Bearer ', ''),
    ]

    return sources.find((token) => token && typeof token === 'string') || null
  }

  private setupTokenRefresh(socket: Socket, token: string) {
    try {
      const decoded = this.jwtService.decode(token) as any

      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp * 1000 - Date.now()
        const refreshTime = expiresIn - 5 * 60 * 1000 // Refresh 5 minutes before expiry

        if (refreshTime > 0) {
          setTimeout(() => {
            socket.emit('token-refresh-required', {
              message: 'Token will expire soon, please refresh',
              expiresIn: 5 * 60 * 1000, // 5 minutes
            })
          }, refreshTime)
        }
      }
    } catch (error) {
      this.logger.error(`Failed to setup token refresh for socket ${socket.id}:`, error)
    }
  }
}
```

### WebSocket Gateway với Middleware

```typescript
// src/websocket/enhanced-websocket.gateway.ts
import {
  WebSocketGateway,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WebSocketLoggerMiddleware } from './middleware/websocket-logger.middleware'
import { WebSocketRateLimitMiddleware } from './middleware/rate-limit.middleware'
import { AuthSessionMiddleware } from './middleware/auth-session.middleware'
import { WsAuthGuard } from '../auth/ws-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { Redis } from 'ioredis'

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
})
@UseGuards(WsAuthGuard)
@UsePipes(new ValidationPipe())
export class EnhancedWebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(EnhancedWebSocketGateway.name)

  constructor(
    private redis: Redis,
    private loggerMiddleware: WebSocketLoggerMiddleware,
    private authSessionMiddleware: AuthSessionMiddleware,
  ) {}

  afterInit(server: Server) {
    // Apply middleware
    server.use((socket: Socket, next) => {
      this.loggerMiddleware.use(socket, next)
    })

    server.use((socket: Socket, next) => {
      this.authSessionMiddleware.use(socket, next)
    })

    // Rate limiting middleware
    const rateLimitMiddleware = new WebSocketRateLimitMiddleware(this.redis, {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30, // 30 requests per minute
    })

    server.use((socket: Socket, next) => {
      rateLimitMiddleware.use(socket, next)
    })

    this.logger.log('Enhanced WebSocket Gateway initialized with middleware')
  }

  async handleConnection(client: Socket) {
    const user = client.data.user

    if (user) {
      this.logger.log(`User ${user.sub} connected: ${client.id}`)

      // Join user to personal room
      await client.join(`user:${user.sub}`)

      // Store connection in Redis
      await this.storeConnection(user.sub, client.id)

      // Send connection confirmation
      client.emit('connection-established', {
        socketId: client.id,
        userId: user.sub,
        timestamp: new Date().toISOString(),
      })

      // Emit user online status to friends/contacts
      await this.notifyUserOnline(user.sub)
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user

    if (user) {
      this.logger.log(`User ${user.sub} disconnected: ${client.id}`)

      // Remove connection from Redis
      await this.removeConnection(user.sub, client.id)

      // Check if user has other active connections
      const userSockets = await this.getUserConnections(user.sub)

      if (userSockets.length === 0) {
        // User is completely offline
        await this.notifyUserOffline(user.sub)
      }
    }
  }

  @SubscribeMessage('heartbeat')
  handleHeartbeat(@ConnectedSocket() client: Socket) {
    // Update last activity timestamp
    client.data.lastActivity = new Date()
    return { type: 'heartbeat-ack', timestamp: new Date().toISOString() }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @MessageBody() data: { roomId: string; roomType?: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Validate room access
      const canJoin = await this.validateRoomAccess(user.sub, data.roomId, data.roomType)

      if (!canJoin) {
        client.emit('error', { message: 'Access denied to room' })
        return { status: 'error', message: 'Access denied' }
      }

      // Join room
      await client.join(data.roomId)

      // Store room membership in Redis
      await this.addUserToRoom(user.sub, data.roomId)

      // Notify room members
      client.to(data.roomId).emit('user-joined-room', {
        userId: user.sub,
        username: user.username,
        roomId: data.roomId,
        timestamp: new Date().toISOString(),
      })

      this.logger.log(`User ${user.sub} joined room ${data.roomId}`)

      return { status: 'success', roomId: data.roomId }
    } catch (error) {
      this.logger.error(`Failed to join room:`, error)
      client.emit('error', { message: 'Failed to join room' })
      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Leave room
      await client.leave(data.roomId)

      // Remove room membership from Redis
      await this.removeUserFromRoom(user.sub, data.roomId)

      // Notify room members
      client.to(data.roomId).emit('user-left-room', {
        userId: user.sub,
        username: user.username,
        roomId: data.roomId,
        timestamp: new Date().toISOString(),
      })

      this.logger.log(`User ${user.sub} left room ${data.roomId}`)

      return { status: 'success', roomId: data.roomId }
    } catch (error) {
      this.logger.error(`Failed to leave room:`, error)
      return { status: 'error', message: error.message }
    }
  }

  // Utility methods for Redis operations
  private async storeConnection(userId: string, socketId: string): Promise<void> {
    await this.redis.sadd(`user:${userId}:sockets`, socketId)
    await this.redis.hset(`socket:${socketId}`, {
      userId,
      connectedAt: new Date().toISOString(),
    })
    await this.redis.expire(`socket:${socketId}`, 24 * 60 * 60) // 24 hours
  }

  private async removeConnection(userId: string, socketId: string): Promise<void> {
    await this.redis.srem(`user:${userId}:sockets`, socketId)
    await this.redis.del(`socket:${socketId}`)
  }

  private async getUserConnections(userId: string): Promise<string[]> {
    return await this.redis.smembers(`user:${userId}:sockets`)
  }

  private async addUserToRoom(userId: string, roomId: string): Promise<void> {
    await this.redis.sadd(`room:${roomId}:users`, userId)
    await this.redis.sadd(`user:${userId}:rooms`, roomId)
  }

  private async removeUserFromRoom(userId: string, roomId: string): Promise<void> {
    await this.redis.srem(`room:${roomId}:users`, userId)
    await this.redis.srem(`user:${userId}:rooms`, roomId)
  }

  private async validateRoomAccess(userId: string, roomId: string, roomType?: string): Promise<boolean> {
    // Implement room access validation logic
    // This could check database permissions, room types, etc.
    return true // Simplified for example
  }

  private async notifyUserOnline(userId: string): Promise<void> {
    // Notify friends/contacts that user is online
    // This could query friends from database and emit to their sockets
    this.server.emit('user-status-changed', {
      userId,
      status: 'online',
      timestamp: new Date().toISOString(),
    })
  }

  private async notifyUserOffline(userId: string): Promise<void> {
    // Notify friends/contacts that user is offline
    this.server.emit('user-status-changed', {
      userId,
      status: 'offline',
      timestamp: new Date().toISOString(),
    })
  }

  // Public methods for external services to emit events
  async emitToUser(userId: string, event: string, data: any): Promise<void> {
    this.server.to(`user:${userId}`).emit(event, data)
  }

  async emitToRoom(roomId: string, event: string, data: any): Promise<void> {
    this.server.to(roomId).emit(event, data)
  }

  async broadcastToAll(event: string, data: any): Promise<void> {
    this.server.emit(event, data)
  }
}
```

### Database Integration for Socket Management

```typescript
// src/websocket/socket-connection.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'
import { User } from '../users/user.entity'

@Entity('socket_connections')
@Index(['userId', 'isActive'])
@Index(['socketId'])
export class SocketConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  socketId: string

  @Column()
  @Index()
  userId: string

  @ManyToOne(() => User, (user) => user.socketConnections, { onDelete: 'CASCADE' })
  user: User

  @Column({ nullable: true })
  namespace: string

  @Column({ type: 'inet', nullable: true })
  ipAddress: string

  @Column({ nullable: true })
  userAgent: string

  @Column({ default: true })
  isActive: boolean

  @CreateDateColumn()
  connectedAt: Date

  @UpdateDateColumn()
  lastActivity: Date

  @Column({ nullable: true })
  disconnectedAt: Date

  @Column({ nullable: true })
  disconnectReason: string
}

// src/websocket/socket-connection.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SocketConnection } from './socket-connection.entity'

@Injectable()
export class SocketConnectionService {
  private readonly logger = new Logger(SocketConnectionService.name)

  constructor(
    @InjectRepository(SocketConnection)
    private socketConnectionRepository: Repository<SocketConnection>,
  ) {}

  async createConnection(data: {
    socketId: string
    userId: string
    namespace?: string
    ipAddress?: string
    userAgent?: string
  }): Promise<SocketConnection> {
    const connection = this.socketConnectionRepository.create({
      ...data,
      isActive: true,
      connectedAt: new Date(),
      lastActivity: new Date(),
    })

    return await this.socketConnectionRepository.save(connection)
  }

  async updateLastActivity(socketId: string): Promise<void> {
    await this.socketConnectionRepository.update({ socketId, isActive: true }, { lastActivity: new Date() })
  }

  async disconnectSocket(socketId: string, reason?: string): Promise<void> {
    await this.socketConnectionRepository.update(
      { socketId, isActive: true },
      {
        isActive: false,
        disconnectedAt: new Date(),
        disconnectReason: reason,
      },
    )
  }

  async getActiveConnectionsForUser(userId: string): Promise<SocketConnection[]> {
    return await this.socketConnectionRepository.find({
      where: { userId, isActive: true },
      order: { connectedAt: 'DESC' },
    })
  }

  async getUserOnlineStatus(userId: string): Promise<boolean> {
    const count = await this.socketConnectionRepository.count({
      where: { userId, isActive: true },
    })

    return count > 0
  }

  async getOnlineUsersCount(): Promise<number> {
    const result = await this.socketConnectionRepository
      .createQueryBuilder('connection')
      .select('COUNT(DISTINCT connection.userId)', 'count')
      .where('connection.isActive = :isActive', { isActive: true })
      .getRawOne()

    return parseInt(result.count) || 0
  }

  async cleanupStaleConnections(olderThanMinutes: number = 30): Promise<void> {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000)

    const result = await this.socketConnectionRepository
      .createQueryBuilder()
      .update(SocketConnection)
      .set({
        isActive: false,
        disconnectedAt: new Date(),
        disconnectReason: 'Stale connection cleanup',
      })
      .where('isActive = :isActive', { isActive: true })
      .andWhere('lastActivity < :cutoffTime', { cutoffTime })
      .execute()

    if (result.affected > 0) {
      this.logger.log(`Cleaned up ${result.affected} stale connections`)
    }
  }

  async getConnectionStats(timeframeHours: number = 24): Promise<any> {
    const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000)

    const [totalConnections, uniqueUsers, avgDuration] = await Promise.all([
      // Total connections in timeframe
      this.socketConnectionRepository.count({
        where: {
          connectedAt: { $gte: since },
        },
      }),

      // Unique users
      this.socketConnectionRepository
        .createQueryBuilder('connection')
        .select('COUNT(DISTINCT connection.userId)', 'count')
        .where('connection.connectedAt >= :since', { since })
        .getRawOne(),

      // Average connection duration
      this.socketConnectionRepository
        .createQueryBuilder('connection')
        .select(
          'AVG(EXTRACT(EPOCH FROM (COALESCE(connection.disconnectedAt, NOW()) - connection.connectedAt)))',
          'avg_duration',
        )
        .where('connection.connectedAt >= :since', { since })
        .getRawOne(),
    ])

    return {
      timeframeHours,
      totalConnections,
      uniqueUsers: parseInt(uniqueUsers.count) || 0,
      averageDurationSeconds: parseFloat(avgDuration.avg_duration) || 0,
      currentlyOnline: await this.getOnlineUsersCount(),
    }
  }
}
```

---

**Tôi đã hoàn thành Giai đoạn 3**. Tiếp theo sẽ là **Giai đoạn 4**: Real-world Use Cases và Integration với Payment System. Bạn có muốn tôi tiếp tục không?

## 💡 Real-world Use Cases và Integration

### 1. Payment Processing với WebSocket Notifications

```typescript
// src/payments/payment-websocket.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { EnhancedWebSocketGateway } from '../websocket/enhanced-websocket.gateway'
import { PaymentService } from './payment.service'
import { OrderService } from '../orders/order.service'
import { NotificationService } from '../notifications/notification.service'

interface PaymentWebSocketData {
  paymentId: string
  orderId: string
  userId: string
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled'
  timestamp: Date
  metadata?: Record<string, any>
}

@Injectable()
export class PaymentWebSocketService {
  private readonly logger = new Logger(PaymentWebSocketService.name)

  constructor(
    private websocketGateway: EnhancedWebSocketGateway,
    private paymentService: PaymentService,
    private orderService: OrderService,
    private notificationService: NotificationService,
  ) {}

  // Emit payment status updates to user
  async notifyPaymentStatusChange(data: PaymentWebSocketData): Promise<void> {
    const { userId, paymentId, status, orderId } = data

    // Emit to user's personal room
    await this.websocketGateway.emitToUser(userId, 'payment-status-updated', {
      paymentId,
      orderId,
      status,
      timestamp: data.timestamp.toISOString(),
      message: this.getPaymentStatusMessage(status),
      metadata: data.metadata,
    })

    // Handle different payment statuses
    switch (status) {
      case 'success':
        await this.handlePaymentSuccess(data)
        break
      case 'failed':
        await this.handlePaymentFailure(data)
        break
      case 'processing':
        await this.handlePaymentProcessing(data)
        break
    }

    this.logger.log(`Payment status notification sent to user ${userId}: ${status}`)
  }

  private async handlePaymentSuccess(data: PaymentWebSocketData): Promise<void> {
    const { userId, orderId, paymentId, amount, currency } = data

    try {
      // Update order status
      await this.orderService.updateOrderStatus(orderId, 'paid')

      // Create success notification
      await this.notificationService.createNotification({
        userId,
        type: 'payment_success',
        title: 'Payment Successful',
        message: `Your payment of ${amount} ${currency} has been processed successfully.`,
        data: { orderId, paymentId },
      })

      // Emit success event with additional data
      await this.websocketGateway.emitToUser(userId, 'payment-success', {
        paymentId,
        orderId,
        amount,
        currency,
        timestamp: new Date().toISOString(),
        nextSteps: {
          orderProcessing: true,
          estimatedDelivery: await this.orderService.calculateDeliveryTime(orderId),
          trackingAvailable: true,
        },
      })

      // Emit to order tracking room if user is subscribed
      await this.websocketGateway.emitToRoom(`order:${orderId}`, 'order-paid', {
        orderId,
        paymentId,
        status: 'paid',
        timestamp: new Date().toISOString(),
      })

      this.logger.log(`Payment success handled for order ${orderId}`)
    } catch (error) {
      this.logger.error(`Failed to handle payment success for order ${orderId}:`, error)
    }
  }

  private async handlePaymentFailure(data: PaymentWebSocketData): Promise<void> {
    const { userId, orderId, paymentId } = data

    try {
      // Update order status
      await this.orderService.updateOrderStatus(orderId, 'payment_failed')

      // Create failure notification
      await this.notificationService.createNotification({
        userId,
        type: 'payment_failed',
        title: 'Payment Failed',
        message: 'Your payment could not be processed. Please try again.',
        data: { orderId, paymentId },
      })

      // Emit failure event with retry options
      await this.websocketGateway.emitToUser(userId, 'payment-failed', {
        paymentId,
        orderId,
        timestamp: new Date().toISOString(),
        retryOptions: {
          canRetry: true,
          retryUrl: `/orders/${orderId}/retry-payment`,
          alternativePaymentMethods: await this.paymentService.getAlternativePaymentMethods(userId),
        },
        supportContact: process.env.SUPPORT_EMAIL,
      })

      this.logger.log(`Payment failure handled for order ${orderId}`)
    } catch (error) {
      this.logger.error(`Failed to handle payment failure for order ${orderId}:`, error)
    }
  }

  private async handlePaymentProcessing(data: PaymentWebSocketData): Promise<void> {
    const { userId, orderId, paymentId } = data

    // Emit processing status with estimated completion time
    await this.websocketGateway.emitToUser(userId, 'payment-processing', {
      paymentId,
      orderId,
      timestamp: new Date().toISOString(),
      estimatedCompletionTime: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes
      message: 'Your payment is being processed. Please do not close this page.',
    })

    // Set up timeout check (example: check again in 5 minutes)
    setTimeout(
      async () => {
        try {
          const payment = await this.paymentService.getPaymentStatus(paymentId)

          if (payment.status === 'processing') {
            // Still processing after 5 minutes, notify user
            await this.websocketGateway.emitToUser(userId, 'payment-delayed', {
              paymentId,
              orderId,
              message: 'Payment is taking longer than expected. You will be notified once completed.',
              supportContact: process.env.SUPPORT_EMAIL,
            })
          }
        } catch (error) {
          this.logger.error(`Failed to check payment status for ${paymentId}:`, error)
        }
      },
      5 * 60 * 1000,
    ) // 5 minutes
  }

  // Real-time payment progress tracking
  async trackPaymentProgress(
    paymentId: string,
    userId: string,
    orderId: string,
    progressSteps: string[],
  ): Promise<void> {
    for (let i = 0; i < progressSteps.length; i++) {
      const step = progressSteps[i]
      const progress = Math.round(((i + 1) / progressSteps.length) * 100)

      await this.websocketGateway.emitToUser(userId, 'payment-progress', {
        paymentId,
        orderId,
        step,
        progress,
        currentStep: i + 1,
        totalSteps: progressSteps.length,
        timestamp: new Date().toISOString(),
      })

      // Simulate processing time between steps
      if (i < progressSteps.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  private getPaymentStatusMessage(status: string): string {
    const messages = {
      pending: 'Payment is pending confirmation',
      processing: 'Payment is being processed',
      success: 'Payment completed successfully',
      failed: 'Payment failed. Please try again',
      cancelled: 'Payment was cancelled',
    }

    return messages[status] || `Payment status: ${status}`
  }

  // Method to be called by payment webhook handlers
  async handlePaymentWebhook(webhookData: any): Promise<void> {
    try {
      const paymentData = this.parseWebhookData(webhookData)
      await this.notifyPaymentStatusChange(paymentData)
    } catch (error) {
      this.logger.error('Failed to handle payment webhook:', error)
    }
  }

  private parseWebhookData(webhookData: any): PaymentWebSocketData {
    // Parse webhook data from payment provider
    // This would vary based on your payment provider (Stripe, PayPal, etc.)
    return {
      paymentId: webhookData.id,
      orderId: webhookData.metadata?.orderId,
      userId: webhookData.metadata?.userId,
      amount: webhookData.amount,
      currency: webhookData.currency,
      status: this.mapPaymentStatus(webhookData.status),
      timestamp: new Date(webhookData.created * 1000),
      metadata: webhookData.metadata,
    }
  }

  private mapPaymentStatus(providerStatus: string): PaymentWebSocketData['status'] {
    // Map payment provider status to our internal status
    const statusMap: Record<string, PaymentWebSocketData['status']> = {
      pending: 'pending',
      processing: 'processing',
      succeeded: 'success',
      failed: 'failed',
      canceled: 'cancelled',
    }

    return statusMap[providerStatus] || 'pending'
  }
}
```

### 2. Live Chat Support System

```typescript
// src/support/support-chat.gateway.ts
import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets'
import { UseGuards, Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WsAuthGuard } from '../auth/ws-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { SupportChatService } from './support-chat.service'

interface ChatMessage {
  id: string
  chatRoomId: string
  senderId: string
  senderType: 'customer' | 'agent'
  message: string
  timestamp: Date
  messageType: 'text' | 'image' | 'file' | 'system'
  metadata?: Record<string, any>
}

@WebSocketGateway({
  namespace: '/support-chat',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard)
export class SupportChatGateway {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(SupportChatGateway.name)

  constructor(private supportChatService: SupportChatService) {}

  @SubscribeMessage('join-support-chat')
  async handleJoinSupportChat(
    @MessageBody() data: { orderId?: string; issue?: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Create or get existing chat room
      const chatRoom = await this.supportChatService.createOrGetChatRoom({
        customerId: user.id,
        orderId: data.orderId,
        issue: data.issue,
      })

      // Join chat room
      await client.join(`support-chat:${chatRoom.id}`)

      // Load chat history
      const messages = await this.supportChatService.getChatHistory(chatRoom.id)

      // Send chat history to customer
      client.emit('chat-history', {
        chatRoomId: chatRoom.id,
        messages,
        agentInfo: chatRoom.assignedAgent
          ? {
              id: chatRoom.assignedAgent.id,
              name: chatRoom.assignedAgent.name,
              avatar: chatRoom.assignedAgent.avatar,
              isOnline: await this.supportChatService.isAgentOnline(chatRoom.assignedAgent.id),
            }
          : null,
      })

      // Notify customer about queue position if no agent assigned
      if (!chatRoom.assignedAgent) {
        const queuePosition = await this.supportChatService.getQueuePosition(chatRoom.id)

        client.emit('queue-status', {
          position: queuePosition,
          estimatedWaitTime: this.calculateEstimatedWaitTime(queuePosition),
          message: `You are #${queuePosition} in the queue. An agent will be with you shortly.`,
        })

        // Notify available agents about new chat request
        await this.notifyAvailableAgents(chatRoom)
      }

      this.logger.log(`Customer ${user.id} joined support chat ${chatRoom.id}`)

      return {
        status: 'success',
        chatRoomId: chatRoom.id,
        hasAgent: !!chatRoom.assignedAgent,
      }
    } catch (error) {
      this.logger.error('Failed to join support chat:', error)
      client.emit('error', { message: 'Failed to join support chat' })
      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('send-support-message')
  async handleSendSupportMessage(
    @MessageBody()
    data: {
      chatRoomId: string
      message: string
      messageType?: 'text' | 'image' | 'file'
      metadata?: Record<string, any>
    },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Validate user access to chat room
      const hasAccess = await this.supportChatService.validateChatAccess(user.id, data.chatRoomId)

      if (!hasAccess) {
        client.emit('error', { message: 'Access denied to chat room' })
        return { status: 'error', message: 'Access denied' }
      }

      // Save message to database
      const message = await this.supportChatService.saveMessage({
        chatRoomId: data.chatRoomId,
        senderId: user.id,
        senderType: user.role === 'agent' ? 'agent' : 'customer',
        message: data.message,
        messageType: data.messageType || 'text',
        metadata: data.metadata,
      })

      // Emit message to all participants in chat room
      this.server.to(`support-chat:${data.chatRoomId}`).emit('new-support-message', {
        id: message.id,
        chatRoomId: data.chatRoomId,
        senderId: user.id,
        senderName: user.name,
        senderType: user.role === 'agent' ? 'agent' : 'customer',
        message: data.message,
        messageType: data.messageType || 'text',
        timestamp: message.createdAt.toISOString(),
        metadata: data.metadata,
      })

      // Update chat room last activity
      await this.supportChatService.updateChatActivity(data.chatRoomId)

      // If message from customer and no agent assigned, escalate priority
      if (user.role !== 'agent') {
        const chatRoom = await this.supportChatService.getChatRoom(data.chatRoomId)

        if (!chatRoom.assignedAgent) {
          await this.escalateChatPriority(chatRoom)
        }
      }

      return { status: 'success', messageId: message.id }
    } catch (error) {
      this.logger.error('Failed to send support message:', error)
      client.emit('error', { message: 'Failed to send message' })
      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('agent-assign-chat')
  async handleAgentAssignChat(
    @MessageBody() data: { chatRoomId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() agent: any,
  ) {
    try {
      // Verify user is an agent
      if (agent.role !== 'agent') {
        client.emit('error', { message: 'Only agents can assign chats' })
        return { status: 'error', message: 'Access denied' }
      }

      // Assign agent to chat
      const chatRoom = await this.supportChatService.assignAgentToChat(data.chatRoomId, agent.id)

      // Join agent to chat room
      await client.join(`support-chat:${data.chatRoomId}`)

      // Notify customer that agent joined
      client.to(`support-chat:${data.chatRoomId}`).emit('agent-joined', {
        chatRoomId: data.chatRoomId,
        agent: {
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar,
        },
        message: `${agent.name} has joined the chat. How can I help you today?`,
        timestamp: new Date().toISOString(),
      })

      // Send system message
      await this.supportChatService.saveMessage({
        chatRoomId: data.chatRoomId,
        senderId: 'system',
        senderType: 'system',
        message: `Agent ${agent.name} joined the chat`,
        messageType: 'system',
      })

      this.logger.log(`Agent ${agent.id} assigned to chat ${data.chatRoomId}`)

      return { status: 'success', chatRoomId: data.chatRoomId }
    } catch (error) {
      this.logger.error('Failed to assign agent to chat:', error)
      client.emit('error', { message: 'Failed to assign chat' })
      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('close-support-chat')
  async handleCloseSupportChat(
    @MessageBody()
    data: {
      chatRoomId: string
      reason?: string
      satisfaction?: number
    },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Close chat room
      await this.supportChatService.closeChatRoom(data.chatRoomId, user.id, data.reason)

      // Notify all participants
      this.server.to(`support-chat:${data.chatRoomId}`).emit('chat-closed', {
        chatRoomId: data.chatRoomId,
        closedBy: user.name,
        reason: data.reason,
        timestamp: new Date().toISOString(),
        satisfaction: data.satisfaction,
      })

      // Remove all participants from room
      const sockets = await this.server.in(`support-chat:${data.chatRoomId}`).fetchSockets()
      for (const socket of sockets) {
        await socket.leave(`support-chat:${data.chatRoomId}`)
      }

      this.logger.log(`Support chat ${data.chatRoomId} closed by ${user.id}`)

      return { status: 'success', message: 'Chat closed successfully' }
    } catch (error) {
      this.logger.error('Failed to close support chat:', error)
      client.emit('error', { message: 'Failed to close chat' })
      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('typing-indicator')
  handleTypingIndicator(
    @MessageBody() data: { chatRoomId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    // Emit typing indicator to other participants
    client.to(`support-chat:${data.chatRoomId}`).emit('user-typing', {
      chatRoomId: data.chatRoomId,
      userId: user.id,
      userName: user.name,
      isTyping: data.isTyping,
      timestamp: new Date().toISOString(),
    })
  }

  private async notifyAvailableAgents(chatRoom: any): Promise<void> {
    // Get online agents
    const onlineAgents = await this.supportChatService.getOnlineAgents()

    // Emit new chat notification to available agents
    for (const agent of onlineAgents) {
      this.server.to(`user:${agent.id}`).emit('new-chat-request', {
        chatRoomId: chatRoom.id,
        customer: {
          id: chatRoom.customerId,
          name: chatRoom.customer.name,
        },
        issue: chatRoom.issue,
        orderId: chatRoom.orderId,
        waitTime: this.calculateWaitTime(chatRoom.createdAt),
        priority: chatRoom.priority,
      })
    }
  }

  private async escalateChatPriority(chatRoom: any): Promise<void> {
    // Increase chat priority based on wait time and customer value
    const waitTime = this.calculateWaitTime(chatRoom.createdAt)

    if (waitTime > 10) {
      // 10 minutes
      await this.supportChatService.updateChatPriority(chatRoom.id, 'high')

      // Notify supervisors about high priority chat
      const supervisors = await this.supportChatService.getSupervisors()

      for (const supervisor of supervisors) {
        this.server.to(`user:${supervisor.id}`).emit('high-priority-chat', {
          chatRoomId: chatRoom.id,
          waitTime,
          customerTier: chatRoom.customer.tier,
          issue: chatRoom.issue,
        })
      }
    }
  }

  private calculateEstimatedWaitTime(queuePosition: number): number {
    // Simple calculation: assume 5 minutes per person in queue
    return queuePosition * 5
  }

  private calculateWaitTime(createdAt: Date): number {
    return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60)) // minutes
  }
}
```

### 3. Live Order Tracking với Real-time Updates

```typescript
// src/orders/order-tracking.gateway.ts
import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets'
import { UseGuards, Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WsAuthGuard } from '../auth/ws-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { OrderTrackingService } from './order-tracking.service'

interface OrderLocation {
  latitude: number
  longitude: number
  address: string
  timestamp: Date
}

interface DeliveryUpdate {
  orderId: string
  status: string
  location?: OrderLocation
  estimatedDelivery?: Date
  driverInfo?: {
    name: string
    phone: string
    vehicleInfo: string
  }
  message?: string
}

@WebSocketGateway({
  namespace: '/order-tracking',
  cors: { origin: '*' },
})
@UseGuards(WsAuthGuard)
export class OrderTrackingGateway {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(OrderTrackingGateway.name)

  constructor(private orderTrackingService: OrderTrackingService) {}

  @SubscribeMessage('start-tracking-order')
  async handleStartTrackingOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    try {
      // Verify user can track this order
      const order = await this.orderTrackingService.getOrderWithAccess(data.orderId, user.id)

      if (!order) {
        client.emit('error', { message: 'Order not found or access denied' })
        return { status: 'error', message: 'Access denied' }
      }

      // Join order tracking room
      await client.join(`order-tracking:${data.orderId}`)

      // Send current order status
      const trackingInfo = await this.orderTrackingService.getOrderTrackingInfo(data.orderId)

      client.emit('order-tracking-info', {
        orderId: data.orderId,
        status: order.status,
        trackingHistory: trackingInfo.history,
        currentLocation: trackingInfo.currentLocation,
        estimatedDelivery: trackingInfo.estimatedDelivery,
        driverInfo: trackingInfo.driverInfo,
        milestones: this.getOrderMilestones(order.status),
      })

      // If order is out for delivery, start live location updates
      if (order.status === 'out-for-delivery' && trackingInfo.driverInfo) {
        await this.startLiveLocationUpdates(data.orderId, trackingInfo.driverInfo.id)
      }

      this.logger.log(`User ${user.id} started tracking order ${data.orderId}`)

      return { status: 'success', orderId: data.orderId }
    } catch (error) {
      this.logger.error('Failed to start order tracking:', error)
      client.emit('error', { message: 'Failed to start tracking' })
      return { status: 'error', message: error.message }
    }
  }

  @SubscribeMessage('stop-tracking-order')
  async handleStopTrackingOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: any,
  ) {
    // Leave order tracking room
    await client.leave(`order-tracking:${data.orderId}`)

    this.logger.log(`User ${user.id} stopped tracking order ${data.orderId}`)

    return { status: 'success', message: 'Stopped tracking order' }
  }

  // Method called by delivery system to update order status
  async updateOrderStatus(orderId: string, statusData: DeliveryUpdate): Promise<void> {
    try {
      // Save status update to database
      await this.orderTrackingService.saveStatusUpdate(orderId, statusData)

      // Emit to all clients tracking this order
      this.server.to(`order-tracking:${orderId}`).emit('order-status-updated', {
        orderId,
        status: statusData.status,
        location: statusData.location,
        estimatedDelivery: statusData.estimatedDelivery,
        driverInfo: statusData.driverInfo,
        message: statusData.message || this.getStatusMessage(statusData.status),
        timestamp: new Date().toISOString(),
        milestones: this.getOrderMilestones(statusData.status),
      })

      // Send push notification for major status changes
      if (this.isMajorStatusChange(statusData.status)) {
        const order = await this.orderTrackingService.getOrder(orderId)

        this.server.to(`user:${order.userId}`).emit('order-notification', {
          type: 'status-update',
          orderId,
          status: statusData.status,
          title: this.getNotificationTitle(statusData.status),
          message: statusData.message || this.getStatusMessage(statusData.status),
          action: {
            label: 'Track Order',
            url: `/orders/${orderId}/track`,
          },
        })
      }

      this.logger.log(`Order status updated: ${orderId} -> ${statusData.status}`)
    } catch (error) {
      this.logger.error(`Failed to update order status for ${orderId}:`, error)
    }
  }

  // Real-time location updates for delivery
  async updateDeliveryLocation(orderId: string, location: OrderLocation, driverInfo?: any): Promise<void> {
    try {
      // Save location update
      await this.orderTrackingService.saveLocationUpdate(orderId, location)

      // Calculate estimated delivery time based on current location
      const estimatedDelivery = await this.orderTrackingService.calculateETA(orderId, location)

      // Emit location update to tracking clients
      this.server.to(`order-tracking:${orderId}`).emit('delivery-location-updated', {
        orderId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
          timestamp: location.timestamp.toISOString(),
        },
        estimatedDelivery: estimatedDelivery?.toISOString(),
        driverInfo,
        distance: await this.orderTrackingService.calculateDistanceToCustomer(orderId, location),
      })
    } catch (error) {
      this.logger.error(`Failed to update delivery location for ${orderId}:`, error)
    }
  }

  private async startLiveLocationUpdates(orderId: string, driverId: string): Promise<void> {
    // This would typically integrate with a driver mobile app
    // that sends location updates every 30 seconds
    this.logger.log(`Started live location tracking for order ${orderId} with driver ${driverId}`)
  }

  private getOrderMilestones(status: string): Array<{
    name: string
    completed: boolean
    timestamp?: string
    description: string
  }> {
    const allMilestones = [
      { name: 'confirmed', description: 'Order confirmed' },
      { name: 'preparing', description: 'Order being prepared' },
      { name: 'ready', description: 'Order ready for pickup' },
      { name: 'picked-up', description: 'Order picked up by driver' },
      { name: 'out-for-delivery', description: 'Out for delivery' },
      { name: 'delivered', description: 'Order delivered' },
    ]

    const statusOrder = ['confirmed', 'preparing', 'ready', 'picked-up', 'out-for-delivery', 'delivered']
    const currentIndex = statusOrder.indexOf(status)

    return allMilestones.map((milestone, index) => ({
      ...milestone,
      completed: index <= currentIndex,
      timestamp: index <= currentIndex ? new Date().toISOString() : undefined,
    }))
  }

  private getStatusMessage(status: string): string {
    const messages = {
      confirmed: 'Your order has been confirmed and is being prepared',
      preparing: 'Your order is being prepared',
      ready: 'Your order is ready for pickup',
      'picked-up': 'Your order has been picked up and is on the way',
      'out-for-delivery': 'Your order is out for delivery',
      delivered: 'Your order has been delivered',
      cancelled: 'Your order has been cancelled',
    }

    return messages[status] || `Order status: ${status}`
  }

  private getNotificationTitle(status: string): string {
    const titles = {
      confirmed: 'Order Confirmed',
      preparing: 'Order Being Prepared',
      ready: 'Order Ready',
      'picked-up': 'Order Picked Up',
      'out-for-delivery': 'Out for Delivery',
      delivered: 'Order Delivered',
      cancelled: 'Order Cancelled',
    }

    return titles[status] || 'Order Update'
  }

  private isMajorStatusChange(status: string): boolean {
    // Define which status changes warrant notifications
    const majorStatuses = ['confirmed', 'out-for-delivery', 'delivered', 'cancelled']
    return majorStatuses.includes(status)
  }
}

// Integration service for external delivery tracking
export class DeliveryTrackingIntegration {
  constructor(
    private orderTrackingGateway: OrderTrackingGateway,
    private logger: Logger = new Logger(DeliveryTrackingIntegration.name),
  ) {}

  // Webhook handler for delivery partner updates
  async handleDeliveryWebhook(webhookData: any): Promise<void> {
    try {
      const { orderId, status, location, driverInfo, estimatedDelivery } = this.parseWebhookData(webhookData)

      await this.orderTrackingGateway.updateOrderStatus(orderId, {
        orderId,
        status,
        location,
        driverInfo,
        estimatedDelivery,
      })

      // If location update, also update real-time location
      if (location && status === 'out-for-delivery') {
        await this.orderTrackingGateway.updateDeliveryLocation(orderId, location, driverInfo)
      }
    } catch (error) {
      this.logger.error('Failed to process delivery webhook:', error)
    }
  }

  private parseWebhookData(webhookData: any): any {
    // Parse webhook data from delivery partner
    // This would vary based on your delivery partner's API
    return {
      orderId: webhookData.order_id,
      status: webhookData.status,
      location: webhookData.location
        ? {
            latitude: webhookData.location.lat,
            longitude: webhookData.location.lng,
            address: webhookData.location.address,
            timestamp: new Date(webhookData.location.timestamp),
          }
        : undefined,
      driverInfo: webhookData.driver
        ? {
            name: webhookData.driver.name,
            phone: webhookData.driver.phone,
            vehicleInfo: webhookData.driver.vehicle,
          }
        : undefined,
      estimatedDelivery: webhookData.estimated_delivery ? new Date(webhookData.estimated_delivery) : undefined,
    }
  }
}
```

---

**Tôi đã hoàn thành Giai đoạn 4**. Tiếp theo sẽ là **Giai đoạn 5** cuối cùng: Best Practices, Common Pitfalls và Performance Optimization. Bạn có muốn tôi tiếp tục không?

## 🎯 Best Practices và Performance Optimization

### 1. WebSocket Performance Best Practices

```typescript
// src/websocket/performance/websocket-performance.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Redis } from 'ioredis'
import { InjectRedis } from '@nestjs-modules/ioredis'

@Injectable()
export class WebSocketPerformanceService {
  private readonly logger = new Logger(WebSocketPerformanceService.name)
  private readonly messageBuffer = new Map<string, any[]>()
  private readonly bufferFlushInterval = 1000 // 1 second

  constructor(@InjectRedis() private redis: Redis) {
    // Flush buffered messages periodically
    setInterval(() => {
      this.flushMessageBuffers()
    }, this.bufferFlushInterval)
  }

  // Batch message sending to reduce overhead
  async bufferMessage(roomId: string, event: string, data: any): Promise<void> {
    const key = `${roomId}:${event}`

    if (!this.messageBuffer.has(key)) {
      this.messageBuffer.set(key, [])
    }

    this.messageBuffer.get(key)!.push({
      data,
      timestamp: Date.now(),
    })

    // If buffer is full, flush immediately
    if (this.messageBuffer.get(key)!.length >= 10) {
      await this.flushBuffer(key)
    }
  }

  private async flushMessageBuffers(): Promise<void> {
    for (const [key, messages] of this.messageBuffer.entries()) {
      if (messages.length > 0) {
        await this.flushBuffer(key)
      }
    }
  }

  private async flushBuffer(key: string): Promise<void> {
    const messages = this.messageBuffer.get(key)
    if (!messages || messages.length === 0) return

    try {
      // Send batched messages
      const [roomId, event] = key.split(':')

      // Implementation would depend on your WebSocket gateway
      // this.websocketGateway.emitToRoom(roomId, `batch-${event}`, messages)

      // Clear buffer
      this.messageBuffer.set(key, [])
    } catch (error) {
      this.logger.error(`Failed to flush buffer for ${key}:`, error)
    }
  }

  // Connection throttling to prevent abuse
  async checkConnectionLimits(userId: string, clientIp: string): Promise<boolean> {
    const userKey = `ws-conn:user:${userId}`
    const ipKey = `ws-conn:ip:${clientIp}`

    const [userConnections, ipConnections] = await Promise.all([this.redis.get(userKey), this.redis.get(ipKey)])

    // Limits: 5 connections per user, 20 per IP
    if (parseInt(userConnections || '0') >= 5) {
      this.logger.warn(`User ${userId} exceeded connection limit`)
      return false
    }

    if (parseInt(ipConnections || '0') >= 20) {
      this.logger.warn(`IP ${clientIp} exceeded connection limit`)
      return false
    }

    // Increment counters
    await Promise.all([
      this.redis.incr(userKey),
      this.redis.incr(ipKey),
      this.redis.expire(userKey, 3600), // 1 hour
      this.redis.expire(ipKey, 3600),
    ])

    return true
  }

  // Rate limiting for message sending
  async checkMessageRateLimit(userId: string): Promise<boolean> {
    const key = `ws-rate:${userId}`
    const limit = 30 // 30 messages per minute
    const window = 60 // 60 seconds

    const current = await this.redis.incr(key)

    if (current === 1) {
      await this.redis.expire(key, window)
    }

    if (current > limit) {
      this.logger.warn(`User ${userId} exceeded message rate limit`)
      return false
    }

    return true
  }

  // Memory usage monitoring
  async getMemoryUsage(): Promise<{
    bufferSize: number
    totalBufferedMessages: number
    largestBuffer: { key: string; size: number }
  }> {
    let totalMessages = 0
    let largestBuffer = { key: '', size: 0 }

    for (const [key, messages] of this.messageBuffer.entries()) {
      totalMessages += messages.length

      if (messages.length > largestBuffer.size) {
        largestBuffer = { key, size: messages.length }
      }
    }

    return {
      bufferSize: this.messageBuffer.size,
      totalBufferedMessages: totalMessages,
      largestBuffer,
    }
  }
}
```

### 2. Error Handling và Resilience Patterns

```typescript
// src/websocket/resilience/websocket-resilience.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  exponentialBase: number
}

@Injectable()
export class WebSocketResilienceService {
  private readonly logger = new Logger(WebSocketResilienceService.name)
  private readonly defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialBase: 2,
  }

  constructor(private eventEmitter: EventEmitter2) {}

  // Circuit breaker pattern for external service calls
  private circuitBreakers = new Map<
    string,
    {
      isOpen: boolean
      failureCount: number
      lastFailureTime: number
      threshold: number
      timeout: number
    }
  >()

  async callWithCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    threshold: number = 5,
    timeout: number = 30000,
  ): Promise<T> {
    const breaker = this.getOrCreateCircuitBreaker(serviceName, threshold, timeout)

    // Check if circuit is open
    if (breaker.isOpen) {
      if (Date.now() - breaker.lastFailureTime < breaker.timeout) {
        throw new Error(`Circuit breaker is open for ${serviceName}`)
      } else {
        // Try to close circuit (half-open state)
        breaker.isOpen = false
        breaker.failureCount = 0
      }
    }

    try {
      const result = await operation()

      // Success - reset failure count
      breaker.failureCount = 0

      return result
    } catch (error) {
      // Failure - increment count
      breaker.failureCount++
      breaker.lastFailureTime = Date.now()

      // Open circuit if threshold reached
      if (breaker.failureCount >= breaker.threshold) {
        breaker.isOpen = true
        this.logger.error(`Circuit breaker opened for ${serviceName}`)

        // Emit event for monitoring
        this.eventEmitter.emit('circuit-breaker.opened', {
          serviceName,
          failureCount: breaker.failureCount,
        })
      }

      throw error
    }
  }

  // Retry with exponential backoff
  async retryWithBackoff<T>(operation: () => Promise<T>, config: Partial<RetryConfig> = {}): Promise<T> {
    const fullConfig = { ...this.defaultRetryConfig, ...config }
    let lastError: Error

    for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        if (attempt === fullConfig.maxRetries) {
          break // Last attempt failed
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          fullConfig.baseDelay * Math.pow(fullConfig.exponentialBase, attempt),
          fullConfig.maxDelay,
        )

        this.logger.warn(
          `Operation failed (attempt ${attempt + 1}/${fullConfig.maxRetries + 1}), retrying in ${delay}ms:`,
          error.message,
        )

        await this.delay(delay)
      }
    }

    throw lastError!
  }

  // Graceful degradation for non-critical features
  async executeWithGracefulDegradation<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    try {
      return await primaryOperation()
    } catch (error) {
      this.logger.warn(`Primary operation failed for ${operationName}, falling back:`, error.message)

      try {
        const result = await fallbackOperation()

        // Emit event for monitoring
        this.eventEmitter.emit('graceful-degradation.used', {
          operationName,
          primaryError: error.message,
        })

        return result
      } catch (fallbackError) {
        this.logger.error(`Both primary and fallback operations failed for ${operationName}:`, {
          primaryError: error.message,
          fallbackError: fallbackError.message,
        })

        throw error // Throw original error
      }
    }
  }

  // Dead letter queue for failed messages
  async handleFailedMessage(message: any, error: Error, retryCount: number = 0): Promise<void> {
    const maxRetries = 3

    if (retryCount < maxRetries) {
      // Schedule retry
      setTimeout(
        async () => {
          try {
            // Attempt to reprocess message
            await this.reprocessMessage(message)
          } catch (retryError) {
            await this.handleFailedMessage(message, retryError as Error, retryCount + 1)
          }
        },
        1000 * Math.pow(2, retryCount),
      ) // Exponential backoff
    } else {
      // Send to dead letter queue
      await this.sendToDeadLetterQueue(message, error)
    }
  }

  private async reprocessMessage(message: any): Promise<void> {
    // Implement message reprocessing logic
    this.logger.log(`Reprocessing message: ${message.id}`)
    // ... reprocessing logic
  }

  private async sendToDeadLetterQueue(message: any, error: Error): Promise<void> {
    const deadLetter = {
      originalMessage: message,
      error: {
        message: error.message,
        stack: error.stack,
      },
      timestamp: new Date().toISOString(),
      attempts: 3,
    }

    // Store in database or external queue for manual review
    this.logger.error(`Message sent to dead letter queue:`, deadLetter)

    // Emit event for monitoring
    this.eventEmitter.emit('message.dead-letter', deadLetter)
  }

  private getOrCreateCircuitBreaker(serviceName: string, threshold: number, timeout: number) {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, {
        isOpen: false,
        failureCount: 0,
        lastFailureTime: 0,
        threshold,
        timeout,
      })
    }

    return this.circuitBreakers.get(serviceName)!
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
```

### 3. Monitoring và Health Checks

```typescript
// src/websocket/monitoring/websocket-monitoring.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus'
import { Redis } from 'ioredis'
import { InjectRedis } from '@nestjs-modules/ioredis'

interface WebSocketMetrics {
  totalConnections: number
  connectionsPerNamespace: Record<string, number>
  messagesPerSecond: number
  errorRate: number
  averageResponseTime: number
  memoryUsage: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
}

@Injectable()
export class WebSocketMonitoringService extends HealthIndicator {
  private readonly logger = new Logger(WebSocketMonitoringService.name)
  private metrics: WebSocketMetrics = {
    totalConnections: 0,
    connectionsPerNamespace: {},
    messagesPerSecond: 0,
    errorRate: 0,
    averageResponseTime: 0,
    memoryUsage: {
      rss: 0,
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
    },
  }

  private messageCount = 0
  private errorCount = 0
  private responseTimes: number[] = []

  constructor(@InjectRedis() private redis: Redis) {
    super()
    this.startMetricsCollection()
  }

  // Health check for WebSocket service
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Check Redis connection
      await this.redis.ping()

      // Check if error rate is acceptable (< 5%)
      const errorRate = this.metrics.errorRate
      const isHealthy = errorRate < 0.05 && this.metrics.totalConnections >= 0

      if (!isHealthy) {
        throw new HealthCheckError('WebSocket service is unhealthy', {
          errorRate,
          totalConnections: this.metrics.totalConnections,
        })
      }

      return this.getStatus(key, true, {
        totalConnections: this.metrics.totalConnections,
        errorRate: this.metrics.errorRate,
        averageResponseTime: this.metrics.averageResponseTime,
      })
    } catch (error) {
      throw new HealthCheckError('WebSocket service is unhealthy', {
        error: error.message,
      })
    }
  }

  // Update connection metrics
  updateConnectionCount(namespace: string, change: number): void {
    this.metrics.totalConnections += change

    if (!this.metrics.connectionsPerNamespace[namespace]) {
      this.metrics.connectionsPerNamespace[namespace] = 0
    }

    this.metrics.connectionsPerNamespace[namespace] += change
  }

  // Track message processing
  trackMessage(responseTime?: number): void {
    this.messageCount++

    if (responseTime) {
      this.responseTimes.push(responseTime)

      // Keep only last 100 response times
      if (this.responseTimes.length > 100) {
        this.responseTimes = this.responseTimes.slice(-100)
      }
    }
  }

  // Track errors
  trackError(): void {
    this.errorCount++
  }

  // Get current metrics
  getMetrics(): WebSocketMetrics {
    return { ...this.metrics }
  }

  // Get detailed connection info
  async getConnectionDetails(): Promise<{
    totalConnections: number
    connectionsByNamespace: Record<string, number>
    connectionsByUser: Record<string, number>
    recentConnections: Array<{
      userId: string
      namespace: string
      connectedAt: string
      clientInfo: any
    }>
  }> {
    // This would typically fetch from Redis or in-memory store
    const connectionDetails = {
      totalConnections: this.metrics.totalConnections,
      connectionsByNamespace: this.metrics.connectionsPerNamespace,
      connectionsByUser: {}, // Implement based on your connection tracking
      recentConnections: [], // Implement based on your connection tracking
    }

    return connectionDetails
  }

  // Export metrics for external monitoring (Prometheus, DataDog, etc.)
  getPrometheusMetrics(): string {
    const metrics = this.metrics

    return `
# HELP websocket_connections_total Total number of WebSocket connections
# TYPE websocket_connections_total gauge
websocket_connections_total ${metrics.totalConnections}

# HELP websocket_messages_per_second Messages processed per second
# TYPE websocket_messages_per_second gauge
websocket_messages_per_second ${metrics.messagesPerSecond}

# HELP websocket_error_rate Error rate percentage
# TYPE websocket_error_rate gauge
websocket_error_rate ${metrics.errorRate}

# HELP websocket_response_time_avg Average response time in milliseconds
# TYPE websocket_response_time_avg gauge
websocket_response_time_avg ${metrics.averageResponseTime}

# HELP websocket_memory_usage Memory usage metrics
# TYPE websocket_memory_usage gauge
websocket_memory_usage{type="rss"} ${metrics.memoryUsage.rss}
websocket_memory_usage{type="heap_used"} ${metrics.memoryUsage.heapUsed}
websocket_memory_usage{type="heap_total"} ${metrics.memoryUsage.heapTotal}
websocket_memory_usage{type="external"} ${metrics.memoryUsage.external}
`.trim()
  }

  private startMetricsCollection(): void {
    // Update metrics every 10 seconds
    setInterval(() => {
      this.updateMetrics()
    }, 10000)
  }

  private updateMetrics(): void {
    // Calculate messages per second
    this.metrics.messagesPerSecond = this.messageCount / 10
    this.messageCount = 0

    // Calculate error rate
    const totalEvents = this.metrics.messagesPerSecond * 10 + this.errorCount
    this.metrics.errorRate = totalEvents > 0 ? this.errorCount / totalEvents : 0
    this.errorCount = 0

    // Calculate average response time
    if (this.responseTimes.length > 0) {
      this.metrics.averageResponseTime =
        this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
    }

    // Update memory usage
    const memUsage = process.memoryUsage()
    this.metrics.memoryUsage = {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
    }

    // Log metrics periodically
    this.logger.log('WebSocket Metrics:', {
      totalConnections: this.metrics.totalConnections,
      messagesPerSecond: this.metrics.messagesPerSecond,
      errorRate: (this.metrics.errorRate * 100).toFixed(2) + '%',
      averageResponseTime: this.metrics.averageResponseTime.toFixed(2) + 'ms',
      memoryUsage: {
        heapUsed: (this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
        heapTotal: (this.metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + 'MB',
      },
    })
  }
}
```

### 4. Common Pitfalls và Solutions

```typescript
// src/websocket/pitfalls/websocket-pitfalls.md

/**
 * COMMON WEBSOCKET PITFALLS VÀ SOLUTIONS
 */

// ❌ PITFALL 1: Memory Leaks từ không cleanup listeners
class BadWebSocketGateway {
  private listeners = new Map()

  @SubscribeMessage('subscribe-updates')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    // BAD: Không cleanup khi disconnect
    const interval = setInterval(() => {
      client.emit('update', { data: 'some data' })
    }, 1000)

    this.listeners.set(client.id, interval) // Memory leak!
  }
}

// ✅ SOLUTION: Proper cleanup
class GoodWebSocketGateway {
  private listeners = new Map()

  @SubscribeMessage('subscribe-updates')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    const interval = setInterval(() => {
      client.emit('update', { data: 'some data' })
    }, 1000)

    this.listeners.set(client.id, interval)
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    // GOOD: Cleanup on disconnect
    const interval = this.listeners.get(client.id)
    if (interval) {
      clearInterval(interval)
      this.listeners.delete(client.id)
    }
  }
}

// ❌ PITFALL 2: Không handle connection limits
class BadConnectionHandling {
  @SubscribeMessage('connect')
  handleConnect(@ConnectedSocket() client: Socket) {
    // BAD: Không check limits, có thể bị DDoS
    console.log('User connected')
  }
}

// ✅ SOLUTION: Connection throttling
class GoodConnectionHandling {
  private connections = new Map<string, number>()

  @SubscribeMessage('connect')
  async handleConnect(@ConnectedSocket() client: Socket) {
    const userIp = client.handshake.address
    const currentConnections = this.connections.get(userIp) || 0

    if (currentConnections >= 5) {
      client.disconnect(true)
      return
    }

    this.connections.set(userIp, currentConnections + 1)
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    const userIp = client.handshake.address
    const currentConnections = this.connections.get(userIp) || 0
    this.connections.set(userIp, Math.max(0, currentConnections - 1))
  }
}

// ❌ PITFALL 3: Blocking operations trong event handlers
class BadEventHandling {
  @SubscribeMessage('heavy-operation')
  async handleHeavyOperation(@MessageBody() data: any) {
    // BAD: Blocking operation
    const result = await this.heavyDatabaseOperation(data)
    return result
  }

  private async heavyDatabaseOperation(data: any) {
    // This could take 10+ seconds and block other requests
    return await this.database.query('COMPLEX_QUERY', data)
  }
}

// ✅ SOLUTION: Queue heavy operations
class GoodEventHandling {
  constructor(private queueService: QueueService) {}

  @SubscribeMessage('heavy-operation')
  async handleHeavyOperation(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    // GOOD: Queue the operation
    const jobId = await this.queueService.addJob('heavy-operation', {
      data,
      clientId: client.id,
    })

    client.emit('operation-queued', { jobId })
    return { status: 'queued', jobId }
  }

  // Process in background and emit result when done
  @OnQueueCompleted('heavy-operation')
  async onHeavyOperationCompleted(job: any) {
    const { result, clientId } = job
    this.server.to(clientId).emit('operation-completed', { result })
  }
}

// ❌ PITFALL 4: Không handle message ordering
class BadMessageOrdering {
  @SubscribeMessage('send-message')
  async handleMessage(@MessageBody() data: any) {
    // BAD: Messages có thể arrive out of order
    await this.saveToDatabase(data)
    this.server.emit('new-message', data)
  }
}

// ✅ SOLUTION: Message sequencing
class GoodMessageOrdering {
  private messageSequence = new Map<string, number>()

  @SubscribeMessage('send-message')
  async handleMessage(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const { roomId, sequence } = data
    const expectedSequence = this.messageSequence.get(roomId) || 0

    if (sequence !== expectedSequence + 1) {
      // Message out of order, request resend
      client.emit('sequence-error', {
        expected: expectedSequence + 1,
        received: sequence,
      })
      return
    }

    await this.saveToDatabase(data)
    this.messageSequence.set(roomId, sequence)
    this.server.to(roomId).emit('new-message', data)
  }
}

// ❌ PITFALL 5: Hardcoded room management
class BadRoomManagement {
  @SubscribeMessage('join-room')
  handleJoinRoom(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    // BAD: Không validate room access
    client.join(data.roomId)
  }
}

// ✅ SOLUTION: Proper room access control
class GoodRoomManagement {
  @SubscribeMessage('join-room')
  async handleJoinRoom(@MessageBody() data: any, @ConnectedSocket() client: Socket, @CurrentUser() user: any) {
    // GOOD: Validate access before joining
    const hasAccess = await this.roomService.validateAccess(user.id, data.roomId)

    if (!hasAccess) {
      client.emit('error', { message: 'Access denied to room' })
      return
    }

    await client.join(data.roomId)

    // Track room membership
    await this.roomService.addMember(data.roomId, user.id)

    client.emit('room-joined', { roomId: data.roomId })
  }
}
```

### 5. Security Best Practices

```typescript
// src/websocket/security/websocket-security.service.ts

/**
 * WEBSOCKET SECURITY BEST PRACTICES
 */

// 1. Input Validation và Sanitization
class WebSocketSecurityValidator {
  static validateMessage(data: any): boolean {
    // Validate message structure
    if (!data || typeof data !== 'object') {
      return false
    }

    // Sanitize strings
    if (data.message && typeof data.message === 'string') {
      data.message = this.sanitizeHtml(data.message)

      // Check message length
      if (data.message.length > 1000) {
        return false
      }
    }

    // Validate room IDs
    if (data.roomId && !this.isValidRoomId(data.roomId)) {
      return false
    }

    return true
  }

  private static sanitizeHtml(input: string): string {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
  }

  private static isValidRoomId(roomId: string): boolean {
    // Only allow alphanumeric and hyphens
    return /^[a-zA-Z0-9-]+$/.test(roomId) && roomId.length <= 50
  }
}

// 2. Rate Limiting per User
class WebSocketRateLimiter {
  private userLimits = new Map<string, { count: number; resetTime: number }>()
  private readonly RATE_LIMIT = 30 // messages per minute
  private readonly WINDOW_MS = 60000 // 1 minute

  checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const userLimit = this.userLimits.get(userId)

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new limit
      this.userLimits.set(userId, {
        count: 1,
        resetTime: now + this.WINDOW_MS,
      })
      return true
    }

    if (userLimit.count >= this.RATE_LIMIT) {
      return false // Rate limit exceeded
    }

    userLimit.count++
    return true
  }
}

// 3. CORS và Origin Validation
const secureWebSocketConfig = {
  cors: {
    origin: (origin: string, callback: Function) => {
      const allowedOrigins = ['https://yourdomain.com', 'https://app.yourdomain.com']

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  },
  // Additional security headers
  allowEIO3: true,
  transports: ['websocket'], // Disable polling for security
}

// 4. Secure Authentication Middleware
@Injectable()
export class WebSocketAuthMiddleware {
  constructor(private jwtService: JwtService) {}

  async validateConnection(socket: Socket): Promise<boolean> {
    try {
      const token = this.extractToken(socket)

      if (!token) {
        return false
      }

      const payload = await this.jwtService.verifyAsync(token)

      // Add user info to socket
      socket.data.user = payload

      // Validate user is still active
      const user = await this.userService.findById(payload.sub)
      if (!user || !user.isActive) {
        return false
      }

      return true
    } catch (error) {
      return false
    }
  }

  private extractToken(socket: Socket): string | null {
    // Try multiple token sources
    const authHeader = socket.handshake.headers.authorization
    const queryToken = socket.handshake.query.token as string
    const cookieToken = socket.handshake.headers.cookie
      ?.split(';')
      .find((c) => c.trim().startsWith('token='))
      ?.split('=')[1]

    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }

    return queryToken || cookieToken || null
  }
}
```

---

## 📋 Tóm tắt và Checklist

### ✅ Implementation Checklist

**Cơ bản:**

- [ ] Cài đặt dependencies (@nestjs/websockets, @nestjs/platform-socket.io)
- [ ] Tạo WebSocket Gateway với basic events
- [ ] Implement authentication guard
- [ ] Setup namespace và room management

**Nâng cao:**

- [ ] Redis adapter cho multi-server scaling
- [ ] Custom middleware cho logging và validation
- [ ] Database integration cho persistent connections
- [ ] Error handling và retry mechanisms

**Production-ready:**

- [ ] Performance monitoring và metrics
- [ ] Rate limiting và connection throttling
- [ ] Security validation và input sanitization
- [ ] Circuit breaker pattern cho external services
- [ ] Health checks và graceful shutdown

### 🚀 Performance Optimization

1. **Message Batching**: Group similar messages để reduce overhead
2. **Connection Pooling**: Limit connections per user/IP
3. **Memory Management**: Cleanup listeners và intervals
4. **Redis Clustering**: Scale Redis cho high availability
5. **Load Balancing**: Distribute connections across servers

### 🔒 Security Guidelines

1. **Authentication**: Always validate JWT tokens
2. **Authorization**: Check room/resource access
3. **Input Validation**: Sanitize all incoming data
4. **Rate Limiting**: Prevent abuse và DDoS
5. **CORS**: Restrict origins trong production

### 📊 Monitoring và Debugging

1. **Metrics**: Track connections, messages, errors
2. **Logging**: Structured logs với correlation IDs
3. **Health Checks**: Monitor service health
4. **Alerting**: Set up alerts cho critical issues
5. **Tracing**: Distributed tracing cho complex flows

---

**🎉 Hoàn thành! Bạn đã có một WebSocket implementation hoàn chỉnh cho production với NestJS.**
