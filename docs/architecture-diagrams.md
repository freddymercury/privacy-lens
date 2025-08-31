# PrivacyLens Architecture Diagrams

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        CE[Chrome Extension]
        AD[Admin Dashboard]
    end
    
    subgraph "Backend Services"
        API[Express API Server]
        
        subgraph "Core Services"
            AS[Assessment Service]
            PS[Policy Finder Service]
            LS[LLM Service]
            ATS[Assessment Trigger Service]
        end
        
        subgraph "Archive Services"
            AJ[Archiver Job]
            DC[Deep Crawler]
            DF[Diff Generator]
            VER[Versioner]
        end
        
        subgraph "Auth & Management"
            AUTH[Auth Service]
            SUB[Subscription Service]
            UPD[Update Service]
        end
    end
    
    subgraph "Data Layer"
        SB[(Supabase DB)]
        S3[S3 Storage]
        REDIS[(Redis Cache)]
    end
    
    subgraph "External Services"
        OAI[OpenAI API]
        STRIPE[Stripe API]
    end
    
    CE -->|GET /api/assessment| API
    CE -->|POST /api/report-unassessed| API
    AD -->|Admin Routes| API
    
    API --> AS
    API --> AUTH
    API --> SUB
    
    AS --> PS
    AS --> LS
    AS --> SB
    
    LS --> OAI
    
    ATS --> AS
    ATS --> SB
    
    AJ --> DC
    DC --> VER
    VER --> DF
    VER --> S3
    VER --> SB
    
    SUB --> STRIPE
    
    API --> REDIS
```

## 2. Database Schema

```mermaid
erDiagram
    users ||--o{ audit_logs : performs
    users ||--o{ subscriptions : has
    users ||--o{ user_tokens : has
    users ||--o{ update_applications : applies
    
    websites ||--o{ policy_versions : has
    websites ||--o{ scan_events : logs
    
    policy_versions ||--o{ policy_assets : contains
    policy_versions ||--o{ policy_diffs : compared_in
    
    unassessed_urls ||--o{ websites : becomes
    
    updates ||--o{ update_applications : applied_to
    
    backfill_tasks ||--|| websites : processes
    
    users {
        uuid id PK
        string email UK
        string username UK
        string password_hash
        string name
        string role
        timestamp created_at
        timestamp updated_at
    }
    
    websites {
        string url PK
        string user_agreement_url
        string user_agreement_hash
        jsonb privacy_assessment
        timestamp last_updated
        boolean manual_entry
        string suggested_policy_url
    }
    
    unassessed_urls {
        string url PK
        timestamp first_recorded
        string status
    }
    
    policy_versions {
        uuid id PK
        string policy_id FK
        int version_number
        timestamp fetched_at
        text normalized_text_snapshot
        string text_hash
        string raw_snapshot_path
        string clean_snapshot_path
        boolean suppress_alert
    }
    
    policy_assets {
        uuid id PK
        uuid policy_version_id FK
        string asset_url
        int depth
        string mime_type
        int bytes
        string asset_hash
        string storage_path
        boolean changed
    }
    
    policy_diffs {
        uuid id PK
        uuid policy_version_id_old FK
        uuid policy_version_id_new FK
        text diff_summary_text
        timestamp created_at
    }
    
    scan_events {
        uuid id PK
        string policy_id FK
        string event_type
        string error_message
        int duration_ms
        timestamp timestamp
        string notes
    }
    
    backfill_tasks {
        uuid id PK
        string domain FK
        string task_type
        string status
        jsonb metadata
        timestamp created_at
        timestamp started_at
        timestamp completed_at
        string error_message
    }
    
    subscriptions {
        uuid id PK
        uuid user_id FK
        string stripe_subscription_id UK
        string plan_type
        string status
        timestamp current_period_start
        timestamp current_period_end
        boolean cancel_at_period_end
    }
    
    audit_logs {
        uuid id PK
        string action
        uuid user_id FK
        timestamp timestamp
        jsonb details
    }
```

## 3. Assessment Request Flow

```mermaid
sequenceDiagram
    participant User
    participant Chrome Extension
    participant Backend API
    participant Assessment Service
    participant Policy Finder
    participant LLM Service
    participant Supabase DB
    participant OpenAI
    
    User->>Chrome Extension: Visits website
    Chrome Extension->>Backend API: GET /api/assessment?url=example.com
    Backend API->>Assessment Service: checkAssessment(url)
    Assessment Service->>Supabase DB: Query websites table
    
    alt Assessment exists
        Supabase DB-->>Assessment Service: Return assessment
        Assessment Service-->>Backend API: Assessment data
        Backend API-->>Chrome Extension: JSON response
        Chrome Extension-->>User: Display badge (H/M/L)
    else No assessment
        Supabase DB-->>Assessment Service: No results
        Assessment Service-->>Backend API: No assessment
        Backend API-->>Chrome Extension: Empty response
        Chrome Extension->>Backend API: POST /api/report-unassessed
        Backend API->>Supabase DB: Insert into unassessed_urls
        Chrome Extension-->>User: Display "?" badge
        
        Note over Backend API: Later, via Assessment Trigger Service
        
        Assessment Service->>Policy Finder: findPolicyUrl(domain)
        Policy Finder-->>Assessment Service: Policy URL found
        Assessment Service->>Policy Finder: Fetch policy content
        Policy Finder-->>Assessment Service: Policy HTML/text
        Assessment Service->>LLM Service: assessPolicy(content)
        LLM Service->>OpenAI: API call with prompt
        OpenAI-->>LLM Service: Assessment results
        LLM Service-->>Assessment Service: Structured assessment
        Assessment Service->>Supabase DB: Store assessment
    end
```

## 4. Deep Crawler Archive Flow

```mermaid
flowchart TD
    Start([Archiver Job Triggered])
    
    Start --> GetPolicies[Get tracked policies from DB]
    GetPolicies --> Loop{For each policy}
    
    Loop --> FetchRoot[Fetch root policy page]
    FetchRoot --> ExtractLinks[Extract all links from page]
    
    ExtractLinks --> FilterLinks[Filter links by domain/relevance]
    FilterLinks --> Depth{Check depth < MAX_DEPTH}
    
    Depth -->|Yes| FetchChild[Fetch child page]
    FetchChild --> StoreAsset[Store raw HTML in S3]
    StoreAsset --> ExtractText[Extract clean text]
    ExtractText --> HashContent[Generate content hash]
    HashContent --> ExtractLinks
    
    Depth -->|No| Concatenate[Concatenate all texts]
    Concatenate --> CompareHash{Hash changed?}
    
    CompareHash -->|No| LogNoChange[Log: No changes]
    LogNoChange --> NextPolicy
    
    CompareHash -->|Yes| CreateVersion[Create new version]
    CreateVersion --> StoreSnapshot[Store concatenated snapshot]
    StoreSnapshot --> InsertDB[Insert policy_versions record]
    InsertDB --> InsertAssets[Insert policy_assets records]
    InsertAssets --> GenDiff{Previous version exists?}
    
    GenDiff -->|Yes| GenerateDiff[Generate diff]
    GenerateDiff --> StoreDiff[Store in policy_diffs]
    StoreDiff --> NextPolicy
    
    GenDiff -->|No| NextPolicy
    
    NextPolicy --> Loop
    Loop -->|Done| End([Complete])
    
    style FetchRoot fill:#f9f,stroke:#333,stroke-width:2px
    style FetchChild fill:#f9f,stroke:#333,stroke-width:2px
    style GenerateDiff fill:#ff9,stroke:#333,stroke-width:4px
```

## 5. Component Interaction Map

```mermaid
graph LR
    subgraph Chrome Extension Components
        BG[background.js]
        POP[popup.js]
        CS[content.js]
        DB[db.js - LocalForage]
        AUTH_E[auth.js]
        UPD_E[updater.js]
    end
    
    subgraph Backend Core Modules
        INDEX[index.js - Entry]
        API_R[api/index.js]
        ADMIN_R[api/admin.js]
        
        subgraph Controllers
            AC[assessmentController]
            ADC[adminController]
            ARC[archiveController]
            UAC[unassessedController]
        end
        
        subgraph Services
            LLM[llmService]
            PF[policyFinderService]
            ATS[assessmentTriggerService]
        end
        
        subgraph Archiver
            AJ_M[archiverJob]
            DC_M[deepCrawler]
            VER_M[versioner]
            DIFF_M[diffMarker]
            LINK_E[linkExtractor]
            LINK_F[linkFilter]
        end
    end
    
    BG --> API_R
    POP --> BG
    CS --> BG
    BG --> DB
    AUTH_E --> BG
    UPD_E --> BG
    
    API_R --> AC
    API_R --> UAC
    ADMIN_R --> ADC
    ADMIN_R --> ARC
    
    AC --> LLM
    AC --> PF
    ADC --> ATS
    ARC --> VER_M
    
    ATS --> AC
    
    AJ_M --> DC_M
    DC_M --> LINK_E
    DC_M --> LINK_F
    DC_M --> VER_M
    VER_M --> DIFF_M
```

## 6. Assessment Processing State Machine

```mermaid
stateDiagram-v2
    [*] --> Unassessed: URL reported
    
    Unassessed --> Processing: Trigger service picks up
    Processing --> FindingPolicy: Start assessment
    
    FindingPolicy --> PolicyFound: Policy URL located
    FindingPolicy --> NotFound: No policy found
    
    PolicyFound --> FetchingContent: Download policy
    FetchingContent --> Analyzing: Send to LLM
    
    Analyzing --> Assessed: LLM returns results
    Analyzing --> Failed: LLM error
    
    NotFound --> ManualReview: Mark for admin
    Failed --> Retry: Exponential backoff
    
    Retry --> Processing: Retry attempt
    Retry --> Failed: Max retries exceeded
    
    Assessed --> [*]: Store in DB
    ManualReview --> [*]: Admin action needed
    Failed --> [*]: Log error
    
    note right of Analyzing
        Processes policy in chunks
        to avoid rate limits
    end note
    
    note left of ManualReview
        Admin can manually provide
        policy URL via dashboard
    end note
```

## 7. Data Flow Through System

```mermaid
flowchart LR
    subgraph Input
        WV[Website Visit]
        API[API Request]
        CRON[Scheduled Job]
    end
    
    subgraph Processing
        EP[Extract Policy]
        AP[Analyze with LLM]
        GD[Generate Diff]
        SA[Store Assessment]
    end
    
    subgraph Storage
        PG[(PostgreSQL)]
        S3[(S3/Storage)]
        CACHE[(Redis)]
    end
    
    subgraph Output
        BADGE[Risk Badge]
        DASH[Dashboard View]
        ARCHIVE[Version History]
        DIFF[Change Diff]
    end
    
    WV --> EP
    API --> EP
    CRON --> EP
    
    EP --> AP
    AP --> SA
    SA --> GD
    
    SA --> PG
    GD --> PG
    EP --> S3
    AP --> CACHE
    
    PG --> BADGE
    PG --> DASH
    S3 --> ARCHIVE
    PG --> DIFF
    
    style AP fill:#ff9,stroke:#333,stroke-width:2px
    style GD fill:#ff9,stroke:#333,stroke-width:4px
```

## 8. Memory Issue - Before and After Fix

### Before Fix (Memory Overflow)
```mermaid
flowchart TD
    A[Deep Crawler completes fetch] --> B[Versioner.upsertPolicyVersionDeep]
    B --> C[Generate concatenated text]
    C --> D[Calculate hash]
    D --> E{Has changed?}
    E -->|Yes| F[Upload to S3]
    F --> G[Insert DB records]
    G --> H{Previous version exists?}
    H -->|Yes| I[Load previous snapshot]
    I --> J[diff.diffWords ONLY]
    J --> K[❌ HEAP OUT OF MEMORY]
    
    H -->|No| L[Complete successfully]
    E -->|No| L
    
    style J fill:#f66,stroke:#333,stroke-width:4px
    style K fill:#f00,stroke:#333,stroke-width:4px,color:#fff
    
    J -.->|Problem| M[Large concatenated texts<br/>110+ assets<br/>Several MB each]
    M -.-> N[diffWords creates<br/>3-4x memory overhead]
    N -.-> K
```

### After Fix (Hybrid Approach)
```mermaid
flowchart TD
    A[Deep Crawler completes fetch] --> B[Versioner.upsertPolicyVersionDeep]
    B --> C[Generate concatenated text]
    C --> D[Calculate hash]
    D --> E{Has changed?}
    E -->|Yes| F[Upload to S3]
    F --> G[Insert DB records]
    G --> H{Previous version exists?}
    H -->|Yes| I[Load previous snapshot]
    I --> SIZE{Text size > 1MB?}
    
    SIZE -->|Yes| LINES[diff.diffLines<br/>Lower memory usage]
    SIZE -->|No| WORDS[diff.diffWords<br/>Better granularity]
    
    LINES --> TRUNC[Truncate large parts<br/>Max 1000 chars each]
    WORDS --> TRUNC
    
    TRUNC --> LIMIT{Diff > 500KB?}
    LIMIT -->|Yes| TRUNCDIFF[Truncate total diff]
    LIMIT -->|No| SAVE[Save to DB]
    TRUNCDIFF --> SAVE
    
    SAVE --> SUCCESS[✅ Complete successfully]
    
    H -->|No| SUCCESS
    E -->|No| SUCCESS
    
    style SIZE fill:#9f9,stroke:#333,stroke-width:2px
    style LINES fill:#9f9,stroke:#333,stroke-width:2px
    style SUCCESS fill:#0f0,stroke:#333,stroke-width:4px,color:#fff
    
    SIZE -.->|Protection| HEAP[Heap size: 3GB<br/>via --max-old-space-size]
    TRUNC -.->|Safety| CATCH[Try-catch with<br/>graceful fallback]
```

## 9. Authentication & Session Flow

```mermaid
sequenceDiagram
    participant User
    participant Chrome Extension
    participant Backend API
    participant Auth Service
    participant Supabase
    participant Session Store
    
    User->>Chrome Extension: Enter credentials
    Chrome Extension->>Backend API: POST /auth/login
    Backend API->>Auth Service: validateCredentials
    Auth Service->>Supabase: Query users table
    Supabase-->>Auth Service: User data
    Auth Service->>Auth Service: bcrypt.compare(password)
    
    alt Valid credentials
        Auth Service->>Session Store: Create session
        Auth Service-->>Backend API: Success + session
        Backend API-->>Chrome Extension: JWT token
        Chrome Extension->>Chrome Extension: Store token
        Chrome Extension-->>User: Show logged in state
    else Invalid credentials
        Auth Service-->>Backend API: Unauthorized
        Backend API-->>Chrome Extension: Error 401
        Chrome Extension-->>User: Show error
    end
    
    Note over Chrome Extension: Subsequent requests
    
    Chrome Extension->>Backend API: Request with JWT
    Backend API->>Auth Service: Verify token
    Auth Service-->>Backend API: Valid/Invalid
    Backend API-->>Chrome Extension: Response/401
```

## 10. Update Distribution System

```mermaid
flowchart TD
    subgraph Admin
        UPLOAD[Upload new version]
        META[Set metadata/changelog]
    end
    
    subgraph Backend
        STORE[Store update info]
        NOTIFY[Update available flag]
    end
    
    subgraph Extensions
        CHECK[Check for updates]
        COMPARE[Compare versions]
        DOWNLOAD[Download update]
        APPLY[Apply update]
    end
    
    UPLOAD --> STORE
    META --> STORE
    STORE --> NOTIFY
    
    CHECK --> NOTIFY
    NOTIFY --> COMPARE
    COMPARE -->|Newer exists| DOWNLOAD
    DOWNLOAD --> APPLY
    APPLY --> CHECK
    
    CHECK -->|Periodic| CHECK
```

## 11. Hybrid Diff Strategy Decision Tree

```mermaid
flowchart TD
    START([Diff Generation Start]) --> CALC[Calculate combined text size]
    CALC --> CHECK_SIZE{Size > 1MB?}
    
    CHECK_SIZE -->|No| WORD[Use diff.diffWords]
    CHECK_SIZE -->|Yes| LINE[Use diff.diffLines]
    
    WORD --> PROCESS[Process changes]
    LINE --> PROCESS
    
    PROCESS --> FOREACH[For each change part]
    FOREACH --> CHECK_PART{Part > 1000 chars?}
    
    CHECK_PART -->|Yes| TRUNC_PART[Truncate to 1000 chars<br/>Add char count]
    CHECK_PART -->|No| KEEP[Keep full part]
    
    TRUNC_PART --> BUILD[Build diff summary]
    KEEP --> BUILD
    
    BUILD --> CHECK_TOTAL{Total > 500KB?}
    CHECK_TOTAL -->|Yes| TRUNC_TOTAL[Truncate to 500KB<br/>Add truncation note]
    CHECK_TOTAL -->|No| FINAL[Final diff summary]
    
    TRUNC_TOTAL --> FINAL
    
    FINAL --> TRY[Try to save to DB]
    TRY --> CATCH{Error occurred?}
    
    CATCH -->|Yes| FALLBACK[Save placeholder message:<br/>'[Diff generation failed]']
    CATCH -->|No| SUCCESS[✅ Diff saved successfully]
    
    FALLBACK --> END([End])
    SUCCESS --> END
    
    style CHECK_SIZE fill:#ff9,stroke:#333,stroke-width:2px
    style LINE fill:#9f9,stroke:#333,stroke-width:2px
    style WORD fill:#9ff,stroke:#333,stroke-width:2px
    style SUCCESS fill:#0f0,stroke:#333,stroke-width:2px
    style FALLBACK fill:#f99,stroke:#333,stroke-width:2px
```

## 12. Memory Optimization Impact

```mermaid
graph LR
    subgraph "Before Fix"
        B1[Text A: 2MB] --> BD[diff.diffWords]
        B2[Text B: 2MB] --> BD
        BD --> BM[Memory: ~12-16MB]
        BM --> CRASH[💥 OOM at 2GB heap]
    end
    
    subgraph "After Fix"
        A1[Text A: 2MB] --> SIZE{Check size}
        A2[Text B: 2MB] --> SIZE
        SIZE -->|> 1MB| AD[diff.diffLines]
        SIZE -->|≤ 1MB| AW[diff.diffWords]
        AD --> AM[Memory: ~5-6MB]
        AW --> AM2[Memory: ~3-4MB]
        AM --> HEAP[3GB heap allocated]
        AM2 --> HEAP
        HEAP --> OK[✅ Processes successfully]
    end
    
    style CRASH fill:#f00,stroke:#333,stroke-width:2px,color:#fff
    style OK fill:#0f0,stroke:#333,stroke-width:2px,color:#fff
    style SIZE fill:#ff9,stroke:#333,stroke-width:2px
```