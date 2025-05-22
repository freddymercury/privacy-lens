# PrivacyLens Process Separation Design

## 1. Introduction

This document outlines the design for separating the PrivacyLens backend into multiple independent processes to improve performance, scalability, and reliability. The current monolithic architecture will be refactored into specialized processes that can be scaled and maintained independently.

### 1.1 Purpose

The primary goals of this process separation are:

- **Improved Performance**: Prevent resource-intensive background tasks from affecting API responsiveness
- **Better Scalability**: Allow different components to scale according to their specific needs
- **Enhanced Reliability**: Isolate failures to prevent a single issue from bringing down the entire system
- **Clearer Separation of Concerns**: Organize code and responsibilities more logically

### 1.2 Scope

This design covers:
- Process separation strategy
- Inter-process communication
- Shared resources and dependencies
- Deployment considerations

## 2. Current Architecture

The current PrivacyLens backend is a monolithic Node.js application that handles:

1. **Client API Endpoints**: Serving the Chrome plugin
2. **Admin Dashboard**: Web interface for administrators
3. **Background Jobs**: Periodic tasks like policy archiving
4. **Archive API**: Endpoints for accessing historical policy data

All components run in a single process, sharing resources and potentially blocking each other during resource-intensive operations.

## 3. Proposed Architecture

We propose separating the backend into four distinct processes. For a visual representation of this architecture, see the [Process Separation Architecture Diagram](./process_separation_diagram.md).

### 3.1 Client API Process

**Purpose**: Handle all endpoints used by the Chrome plugin with minimal latency.

**Endpoints**:
- Assessment endpoints (`/api/assessment`, `/api/trigger-assessment/:url`, `/api/report-unassessed`)
- Authentication endpoints (`/api/auth/*`)
- Subscription endpoints (`/api/subscription/*`)
- Update endpoints (`/api/updates/*`)

**Key Characteristics**:
- Optimized for low latency and high availability
- Minimal background processing
- Focused on serving Chrome plugin requests efficiently

### 3.2 Admin Dashboard Process

**Purpose**: Serve the administrative web interface.

**Endpoints**:
- Admin authentication routes (`/admin/login`, `/admin/logout`)
- Dashboard routes (`/admin`)
- Assessment management routes (`/admin/assessments/*`)
- Unassessed URLs management (`/admin/unassessed/*`)
- Analytics routes (`/admin/analytics`)
- User management routes (`/admin/users/*`)
- Audit log routes (`/admin/audit-logs`)

**Key Characteristics**:
- Optimized for admin user experience
- Can handle more complex queries and operations
- Lower request volume than client API

### 3.3 Background Jobs Process

**Purpose**: Execute periodic and resource-intensive tasks without affecting API responsiveness.

**Jobs**:
- Policy archiving (via `archiverJob.js`)
- Batch assessment processing (via `assessmentTriggerService.js`)
- Update generation and distribution
- Database maintenance tasks

**Key Characteristics**:
- No direct HTTP endpoints
- Scheduled and queue-based execution
- Resource-intensive operations
- Can be scaled independently based on workload

### 3.4 Archive API Process

**Purpose**: Serve historical policy data and diffs.

**Endpoints**:
- Policy archive routes (`/api/v1/policies/*`)

**Key Characteristics**:
- Specialized for serving potentially large policy documents and diffs
- May involve complex database queries and storage operations
- Can be scaled independently based on archive usage

## 4. Dependencies and Shared Resources

### 4.1 Shared Database

All processes will access the same Supabase database but focus on different tables or operations:

- **Client API Process**: Primarily reads from assessments, writes to unassessed_urls
- **Admin Dashboard Process**: Reads and writes across multiple tables
- **Background Jobs Process**: Batch operations on policies, policy_versions, policy_assets
- **Archive API Process**: Primarily reads from policy_versions and policy_assets

### 4.2 Code Dependencies

Several components have shared code dependencies that need to be addressed:

1. **Assessment Processing Logic**:
   - The `/api/trigger-assessment/:url` endpoint and background assessment processing both use `assessmentTriggerService.processSingleUrl()`
   - Solution: Extract core assessment logic into a shared library

2. **Authentication Logic**:
   - Client and admin authentication use different controllers but similar patterns
   - Solution: Extract core authentication logic into a shared library

3. **Database Access**:
   - All processes need database access
   - Solution: Create a shared database access library with appropriate connection pooling

### 4.3 Process Dependencies

Some processes depend on others to complete certain workflows:

1. **Client API → Background Jobs**:
   - When a new URL is reported as unassessed, it's eventually processed by the background jobs
   - Solution: Use a message queue for asynchronous communication

2. **Background Jobs → Archive API**:
   - The archiver job creates data that's served by the Archive API
   - Solution: No direct communication needed; data flows through the database

## 5. Inter-Process Communication

### 5.1 Message Queue

A message queue system (e.g., Redis, RabbitMQ, or AWS SQS) will be used for asynchronous communication between processes:

1. **Client API → Background Jobs**:
   - Queue unassessed URLs for processing
   - Trigger immediate assessments when needed

2. **Admin Dashboard → Background Jobs**:
   - Trigger batch assessment processing
   - Schedule archive operations

### 5.2 Shared Configuration

A shared configuration system will ensure consistent settings across all processes:

- Environment variables for process-specific settings
- Shared configuration files or database tables for system-wide settings
- Feature flags for controlled rollout of new functionality

## 6. Implementation Strategy

### 6.1 Code Organization

The codebase will be reorganized to support the new architecture:

```
/privacy-lens
  /shared                 # Shared libraries and utilities
    /db                   # Database access layer
    /auth                 # Authentication utilities
    /assessment           # Core assessment logic
    /config               # Shared configuration
  /client-api             # Client API process
  /admin-dashboard        # Admin Dashboard process
  /background-jobs        # Background Jobs process
  /archive-api            # Archive API process
```

### 6.2 Shared Code Extraction

Key shared functionality will be extracted into libraries:

1. **Database Access Layer**:
   - Consistent database connection handling
   - Shared query utilities
   - Transaction management

2. **Assessment Core**:
   - URL normalization
   - Policy location and extraction
   - LLM assessment logic

3. **Authentication Utilities**:
   - Token validation
   - Permission checking
   - User management

### 6.3 Migration Approach

The migration will follow these steps:

1. Introduce NGINX as a reverse proxy in front of the backend.
   - Configure NGINX to route all API and admin traffic to the existing monolith initially.
   - This provides a single entry point and prepares for future routing changes.
2. Extract shared code into libraries
3. Create the four separate process applications
4. Implement message queue communication
5. Test each process independently
6. Deploy new processes one by one, updating NGINX to route relevant endpoints to each new process as it is ready
7. Gradually shift all traffic from the monolith to the new processes

### 6.4 NGINX Reverse Proxy

NGINX will serve as the entry point for all HTTP(S) traffic to the PrivacyLens backend. Its key roles are:

- Routing requests to the appropriate backend process based on URL patterns:
  - `/api/*` → Client API process
  - `/admin/*` → Admin Dashboard process
  - `/api/v1/policies/*` → Archive API process
  - Background jobs: no direct HTTP traffic
- During migration, NGINX will initially route all traffic to the monolith, then incrementally update routes as new processes are deployed.
- Enables blue/green deployments, canary releases, and easy rollback.
- Provides a single point for TLS termination, logging, and request/response manipulation if needed.

This approach allows for a safe, incremental migration to the new architecture and simplifies operational management.

## 7. Deployment Considerations

### 7.1 Process Management

Each process will be deployed as a separate service:

- Docker containers for local development and testing
- Kubernetes pods or AWS ECS tasks for production
- PM2 or similar for simpler deployments

### 7.2 Scaling Strategy

Each process can be scaled independently based on its specific needs:

- **Client API Process**: Scale based on Chrome plugin user activity
- **Admin Dashboard Process**: Scale based on admin user count
- **Background Jobs Process**: Scale based on job queue length and processing requirements
- **Archive API Process**: Scale based on archive access patterns

### 7.3 Monitoring and Observability

Enhanced monitoring will be implemented:

- Process-specific metrics and logs
- Cross-process request tracing
- Health checks for each process
- Alerting based on process-specific thresholds

## 8. Security Considerations

### 8.1 Authentication and Authorization

- Each process will validate authentication independently
- Shared JWT secret or OAuth integration for consistent authentication
- Process-specific authorization rules

### 8.2 Inter-Process Security

- Secure message queue access
- Network-level isolation between processes
- Principle of least privilege for database access

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Increased deployment complexity | Medium | Comprehensive deployment automation and documentation |
| Inter-process communication failures | High | Robust error handling, retries, and circuit breakers |
| Inconsistent shared code | Medium | Versioned shared libraries and automated testing |
| Database connection overhead | Medium | Connection pooling and optimized query patterns |
| Development workflow complexity | Medium | Clear development guidelines and local environment setup |

## 10. Future Considerations

- **Serverless Architecture**: Evaluate moving certain processes to serverless functions
- **Microservices Evolution**: Further decomposition into more granular services
- **Event Sourcing**: Consider event sourcing for more resilient inter-process communication
- **GraphQL API**: Evaluate GraphQL for more efficient client-server communication

## 11. Conclusion

This process separation design provides a clear path to improving the performance, scalability, and reliability of the PrivacyLens backend. By separating concerns into dedicated processes, we can optimize each component for its specific requirements while maintaining the overall functionality of the system.

The implementation will require careful planning and coordination, but the benefits in terms of system resilience and development velocity will be significant.

## Appendix A: Detailed Tasks for Introducing NGINX as a Reverse Proxy

### 1. Install and Set Up NGINX
- [ ] Install NGINX on development, staging, and production environments.
  - macOS: `brew install nginx`
  - Ubuntu: `sudo apt-get install nginx`
- [ ] Verify installation with `nginx -v` and by accessing the default page at `http://localhost:80`.

### 2. Design the Initial NGINX Configuration
- [ ] Create a new NGINX config file (e.g., `privacy-lens.conf`).
- [ ] Set up a server block to listen on the desired port (80 for HTTP, 443 for HTTPS).
- [ ] Configure `proxy_pass` to route all incoming traffic to the current monolith backend (e.g., Node.js app on port 3000).
- [ ] Set up basic headers for `X-Forwarded-For`, `Host`, etc.
- [ ] (Optional) Enable gzip compression for responses.

### 3. Prepare for HTTPS (Recommended for Production)
- [ ] Obtain SSL certificates (e.g., via Let's Encrypt or your CA).
- [ ] Configure NGINX for HTTPS (`ssl_certificate`, `ssl_certificate_key`).
- [ ] Redirect HTTP to HTTPS for all traffic.

### 4. Test the Proxy Setup Locally
- [ ] Start your backend as usual (e.g., `node app.js` on port 3000).
- [ ] Start NGINX with your new config.
- [ ] Access your API and admin endpoints via NGINX (e.g., `http://localhost/api/health`).
- [ ] Verify headers and that all routes work as expected.

### 5. Logging and Monitoring
- [ ] Configure access and error logs in NGINX.
- [ ] Set up log rotation if needed.

### 6. Prepare for Future Routing
- [ ] Document URL patterns for each future process (Client API, Admin Dashboard, Archive API).
- [ ] Add comments or placeholder location blocks in your NGINX config for these routes, all pointing to the monolith for now.

### 7. Deploy to Staging/Production
- [ ] Deploy NGINX config to your staging environment.
- [ ] Test all endpoints through NGINX in staging.
- [ ] Monitor logs for errors or misrouted requests.
- [ ] Roll out to production once verified.

### 8. Update Documentation
- [ ] Document the NGINX setup in your project's README or deployment docs.
- [ ] Include instructions for updating routes as new processes are deployed.

### 9. (Optional) Advanced Features
- [ ] Set up rate limiting in NGINX for extra protection.
- [ ] Enable caching for static assets or infrequently changing endpoints.
- [ ] Configure health checks for backend services.

---

### Sample NGINX Config: Initial Setup

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS (uncomment if using SSL)
    # return 301 https://$host$request_uri;

    # Proxy all traffic to the monolith backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Future: Route /api/ to client API process
    # location /api/ {
    #     proxy_pass http://client-api:PORT;
    # }

    # Future: Route /admin/ to admin dashboard process
    # location /admin/ {
    #     proxy_pass http://admin-dashboard:PORT;
    # }

    # Future: Route /api/v1/policies/ to archive API process
    # location /api/v1/policies/ {
    #     proxy_pass http://archive-api:PORT;
    # }

    # (Optional) Enable gzip compression
    # gzip on;
    # gzip_types text/plain application/json application/javascript text/css;

    access_log /var/log/nginx/privacy-lens.access.log;
    error_log /var/log/nginx/privacy-lens.error.log;
}
```

- Replace `your-domain.com` and backend ports as appropriate.
- For HTTPS, add `listen 443 ssl;` and SSL certificate directives.
- Update the config as you deploy new processes.

## Appendix B: NGINX CORS Configuration for Chrome Plugin Support

To ensure the Chrome plugin can communicate with your backend via NGINX, add the following CORS configuration to your NGINX server block (or relevant location block):

```nginx
# --- CORS configuration for PrivacyLens API ---
# Allow CORS for Chrome extension and localhost (dev)
add_header 'Access-Control-Allow-Origin' "$http_origin" always;
add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
add_header 'Access-Control-Allow-Credentials' 'true' always;

# Handle preflight requests
if ($request_method = 'OPTIONS') {
    add_header 'Access-Control-Max-Age' 1728000;
    add_header 'Content-Type' 'text/plain charset=UTF-8';
    add_header 'Content-Length' 0;
    return 204;
}
```

### Notes:
- This configuration allows any origin that makes a request (echoes back `$http_origin`). For production, you may want to restrict this to your extension and web domains only.
- For development, this will allow requests from `localhost` and any Chrome extension.
- If you use cookies or HTTP authentication, the `Access-Control-Allow-Credentials: true` header is required.
- If your backend (Node.js/Express) also sets CORS headers, ensure they do not conflict with NGINX.

### Checklist for Testing CORS
- [ ] Add the above CORS block to your NGINX config and reload NGINX.
- [ ] Build and load your Chrome plugin in both development and production modes.
- [ ] Perform actions in the plugin that make API calls.
- [ ] Check the browser console and network tab for CORS errors.
- [ ] If you see errors like "No 'Access-Control-Allow-Origin' header," update your NGINX or backend CORS config.
- [ ] For production, consider restricting allowed origins to your extension's ID and your web domains for security.

---

If you need a more restrictive CORS policy or want to see an example for Express/Node.js, let me know!
