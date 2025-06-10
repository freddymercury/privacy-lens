# PrivacyLens Process Separation Architecture Diagram

The following diagram illustrates the proposed process separation architecture for the PrivacyLens backend system.

```mermaid
graph TD
    subgraph "Client API Process"
        A1[Assessment Endpoints]
        A2[Authentication Endpoints]
        A3[Subscription Endpoints]
        A4[Update Endpoints]
    end

    subgraph "Admin Dashboard Process"
        B1[Admin Authentication]
        B2[Dashboard Routes]
        B3[Assessment Management]
        B4[User Management]
        B5[Analytics]
    end

    subgraph "Background Jobs Process"
        C1[Policy Archiver]
        C2[Assessment Processor]
        C3[Update Generator]
        C4[Database Maintenance]
    end

    subgraph "Archive API Process"
        D1[Policy Version Endpoints]
        D2[Policy Diff Endpoints]
        D3[Asset Streaming]
    end

    subgraph "Shared Resources"
        DB[(Supabase Database)]
        MQ[Message Queue]
        S3[(S3 Storage)]
    end

    %% Client connections
    Chrome[Chrome Plugin] --> A1
    Chrome --> A2
    Chrome --> A3
    Chrome --> A4
    Chrome -.-> D1
    
    %% Admin connections
    Admin[Admin Users] --> B1
    Admin --> B2
    Admin --> B3
    Admin --> B4
    Admin --> B5

    %% Process to shared resource connections
    A1 --> DB
    A2 --> DB
    A3 --> DB
    A4 --> DB
    A1 --> MQ
    
    B1 --> DB
    B2 --> DB
    B3 --> DB
    B4 --> DB
    B5 --> DB
    B3 --> MQ
    
    C1 --> DB
    C2 --> DB
    C3 --> DB
    C4 --> DB
    C1 --> S3
    C2 <-- Consumes messages --> MQ
    
    D1 --> DB
    D2 --> DB
    D3 --> DB
    D3 --> S3

    %% Inter-process dependencies
    A1 -.-> |Report unassessed URLs| C2
    B3 -.-> |Trigger assessments| C2
    C1 -.-> |Creates archive data| D1
    C1 -.-> |Creates archive data| D2
    C1 -.-> |Stores assets| D3

    classDef process fill:#f9f,stroke:#333,stroke-width:2px;
    classDef resource fill:#bbf,stroke:#333,stroke-width:2px;
    classDef client fill:#bfb,stroke:#333,stroke-width:2px;
    
    class A1,A2,A3,A4,B1,B2,B3,B4,B5,C1,C2,C3,C4,D1,D2,D3 process;
    class DB,MQ,S3 resource;
    class Chrome,Admin client;
```

## Legend

- **Solid lines**: Direct API calls or database access
- **Dotted lines**: Indirect dependencies or asynchronous communication
- **Green boxes**: Client applications
- **Pink boxes**: Server processes
- **Blue boxes**: Shared resources

## Process Communication Flow

1. **Chrome Plugin → Client API Process**: Direct API calls for assessments, authentication, etc.
2. **Client API Process → Message Queue**: Asynchronous tasks like reporting unassessed URLs
3. **Background Jobs Process ← Message Queue**: Consumes messages to process tasks
4. **Background Jobs Process → Database**: Stores processed data
5. **Archive API Process → Database**: Retrieves archive data to serve to clients
6. **Archive API Process → S3 Storage**: Retrieves stored policy assets

This architecture allows each process to operate independently while sharing data through the database and communicating asynchronously through the message queue.
