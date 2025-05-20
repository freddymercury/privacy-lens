/**
 * Subscriptions Database Module for PrivacyLens
 * 
 * This module provides functions for working with user subscriptions.
 */

import { getSupabaseAdminClient, getSupabaseClientWithContext, executeWithRetry, logDatabaseOperation } from './index.js';
import { createLogger } from '../config/logger.js';
import { getContext } from '../config/context.js';
import { v4 as uuidv4 } from 'uuid';

// Initialize logger
const logger = createLogger('SubscriptionsDB');

// Table names
const SUBSCRIPTIONS_TABLE = 'subscriptions';
const SUBSCRIPTION_PLANS_TABLE = 'subscription_plans';
const SUBSCRIPTION_FEATURES_TABLE = 'subscription_features';
const PLAN_FEATURES_TABLE = 'plan_features';
const PAYMENT_METHODS_TABLE = 'payment_methods';
const INVOICES_TABLE = 'invoices';

/**
 * Get a subscription by ID
 * @param {string} id - Subscription ID
 * @returns {Promise<Object>} - Subscription object
 */
export async function getSubscriptionById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .select(`
          *,
          plan:plan_id (
            *,
            features:${PLAN_FEATURES_TABLE} (
              feature:feature_id (*)
            )
          ),
          payment_method:payment_method_id (*)
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getSubscriptionById', SUBSCRIPTIONS_TABLE, { id }, result);
    
    // Format the features array
    if (result.data && result.data.plan && result.data.plan.features) {
      result.data.plan.features = result.data.plan.features.map(f => f.feature);
    }
    
    return result;
  } catch (error) {
    logger.error('Error getting subscription by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get a subscription by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Subscription object
 */
export async function getSubscriptionByUserId(userId) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .select(`
          *,
          plan:plan_id (
            *,
            features:${PLAN_FEATURES_TABLE} (
              feature:feature_id (*)
            )
          ),
          payment_method:payment_method_id (*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getSubscriptionByUserId', SUBSCRIPTIONS_TABLE, { userId }, result);
    
    // Format the features array
    if (result.data && result.data.plan && result.data.plan.features) {
      result.data.plan.features = result.data.plan.features.map(f => f.feature);
    }
    
    return result;
  } catch (error) {
    logger.error('Error getting subscription by user ID', { error: error.message, stack: error.stack, userId });
    throw error;
  }
}

/**
 * Create a new subscription
 * @param {Object} subscriptionData - Subscription data
 * @param {string} subscriptionData.userId - User ID
 * @param {string} subscriptionData.planId - Plan ID
 * @param {string} subscriptionData.paymentMethodId - Payment method ID
 * @param {Date} subscriptionData.startDate - Subscription start date
 * @param {Date} subscriptionData.endDate - Subscription end date
 * @param {string} subscriptionData.status - Subscription status
 * @param {Object} subscriptionData.metadata - Subscription metadata
 * @returns {Promise<Object>} - Created subscription object
 */
export async function createSubscription(subscriptionData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Check if user already has an active subscription
      const { data: existingSubscription, error: checkError } = await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .select('id')
        .eq('user_id', subscriptionData.userId)
        .eq('status', 'active')
        .single();
      
      if (!checkError && existingSubscription) {
        // Update the existing subscription to inactive
        const { error: updateError } = await supabase
          .from(SUBSCRIPTIONS_TABLE)
          .update({
            status: 'inactive',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSubscription.id);
        
        if (updateError) {
          logger.warn('Error updating existing subscription', { error: updateError.message, subscriptionId: existingSubscription.id });
        }
      }
      
      // Create the subscription
      const subscriptionId = uuidv4();
      
      const { data: subscription, error: createError } = await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .insert({
          id: subscriptionId,
          user_id: subscriptionData.userId,
          plan_id: subscriptionData.planId,
          payment_method_id: subscriptionData.paymentMethodId,
          start_date: subscriptionData.startDate || new Date().toISOString(),
          end_date: subscriptionData.endDate,
          status: subscriptionData.status || 'active',
          metadata: subscriptionData.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
      
      if (createError) {
        throw createError;
      }
      
      // Get the full subscription with plan and payment method
      return await getSubscriptionById(subscriptionId);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createSubscription', SUBSCRIPTIONS_TABLE, { userId: subscriptionData.userId }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating subscription', { error: error.message, stack: error.stack, userId: subscriptionData.userId });
    throw error;
  }
}

/**
 * Update a subscription
 * @param {string} id - Subscription ID
 * @param {Object} subscriptionData - Subscription data to update
 * @returns {Promise<Object>} - Updated subscription object
 */
export async function updateSubscription(id, subscriptionData) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the subscription
      const updateData = {
        ...subscriptionData,
        updated_at: new Date().toISOString()
      };
      
      const { data: subscription, error: updateError } = await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      // Get the full subscription with plan and payment method
      return await getSubscriptionById(id);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updateSubscription', SUBSCRIPTIONS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating subscription', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Cancel a subscription
 * @param {string} id - Subscription ID
 * @param {Object} cancelData - Cancellation data
 * @param {string} cancelData.reason - Cancellation reason
 * @param {Date} cancelData.cancelDate - Cancellation date
 * @returns {Promise<Object>} - Cancelled subscription object
 */
export async function cancelSubscription(id, cancelData = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the subscription
      const { data: subscription, error: updateError } = await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .update({
          status: 'cancelled',
          cancel_reason: cancelData.reason,
          cancel_date: cancelData.cancelDate || new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      // Get the full subscription with plan and payment method
      return await getSubscriptionById(id);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('cancelSubscription', SUBSCRIPTIONS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error cancelling subscription', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get subscriptions
 * @param {Object} options - Query options
 * @param {string} options.userId - Filter by user ID
 * @param {string} options.planId - Filter by plan ID
 * @param {string} options.status - Filter by status
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @param {number} options.limit - Maximum number of subscriptions to return
 * @param {number} options.offset - Number of subscriptions to skip
 * @param {string} options.sortBy - Field to sort by
 * @param {boolean} options.sortDesc - Sort in descending order
 * @returns {Promise<Object>} - Subscriptions object
 */
export async function getSubscriptions(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(SUBSCRIPTIONS_TABLE)
        .select(`
          *,
          plan:plan_id (
            *,
            features:${PLAN_FEATURES_TABLE} (
              feature:feature_id (*)
            )
          ),
          payment_method:payment_method_id (*)
        `);
      
      // Apply filters
      if (options.userId) {
        query = query.eq('user_id', options.userId);
      }
      
      if (options.planId) {
        query = query.eq('plan_id', options.planId);
      }
      
      if (options.status) {
        query = query.eq('status', options.status);
      }
      
      if (options.startDate) {
        query = query.gte('start_date', new Date(options.startDate).toISOString());
      }
      
      if (options.endDate) {
        query = query.lte('end_date', new Date(options.endDate).toISOString());
      }
      
      // Apply sorting
      if (options.sortBy) {
        const order = options.sortDesc ? 'desc' : 'asc';
        query = query.order(options.sortBy, { ascending: !options.sortDesc });
      } else {
        // Default sort by created_at desc
        query = query.order('created_at', { ascending: false });
      }
      
      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }
      
      return await query;
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getSubscriptions', SUBSCRIPTIONS_TABLE, options, result);
    
    // Format the features array for each subscription
    if (result.data) {
      result.data = result.data.map(subscription => {
        if (subscription.plan && subscription.plan.features) {
          subscription.plan.features = subscription.plan.features.map(f => f.feature);
        }
        return subscription;
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Error getting subscriptions', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Get a subscription plan by ID
 * @param {string} id - Plan ID
 * @returns {Promise<Object>} - Plan object
 */
export async function getSubscriptionPlanById(id) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      return await supabase
        .from(SUBSCRIPTION_PLANS_TABLE)
        .select(`
          *,
          features:${PLAN_FEATURES_TABLE} (
            feature:feature_id (*)
          )
        `)
        .eq('id', id)
        .single();
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getSubscriptionPlanById', SUBSCRIPTION_PLANS_TABLE, { id }, result);
    
    // Format the features array
    if (result.data && result.data.features) {
      result.data.features = result.data.features.map(f => f.feature);
    }
    
    return result;
  } catch (error) {
    logger.error('Error getting subscription plan by ID', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Get subscription plans
 * @param {Object} options - Query options
 * @param {boolean} options.active - Filter by active status
 * @param {string} options.type - Filter by plan type
 * @returns {Promise<Object>} - Plans object
 */
export async function getSubscriptionPlans(options = {}) {
  try {
    const operation = async () => {
      const supabase = getSupabaseClientWithContext();
      
      let query = supabase
        .from(SUBSCRIPTION_PLANS_TABLE)
        .select(`
          *,
          features:${PLAN_FEATURES_TABLE} (
            feature:feature_id (*)
          )
        `);
      
      // Apply filters
      if (options.active !== undefined) {
        query = query.eq('active', options.active);
      }
      
      if (options.type) {
        query = query.eq('type', options.type);
      }
      
      // Apply sorting
      query = query.order('price', { ascending: true });
      
      return await query;
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('getSubscriptionPlans', SUBSCRIPTION_PLANS_TABLE, options, result);
    
    // Format the features array for each plan
    if (result.data) {
      result.data = result.data.map(plan => {
        if (plan.features) {
          plan.features = plan.features.map(f => f.feature);
        }
        return plan;
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Error getting subscription plans', { error: error.message, stack: error.stack, options });
    throw error;
  }
}

/**
 * Create a new subscription plan
 * @param {Object} planData - Plan data
 * @param {string} planData.name - Plan name
 * @param {string} planData.description - Plan description
 * @param {number} planData.price - Plan price
 * @param {string} planData.interval - Plan interval (monthly, yearly, etc.)
 * @param {string} planData.type - Plan type
 * @param {boolean} planData.active - Plan active status
 * @param {Array<string>} planData.featureIds - Feature IDs
 * @param {Object} planData.metadata - Plan metadata
 * @returns {Promise<Object>} - Created plan object
 */
export async function createSubscriptionPlan(planData) {
  try {
    // Get the current context
    const context = getContext();
    
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Create the plan
      const planId = uuidv4();
      
      const { data: plan, error: planError } = await supabase
        .from(SUBSCRIPTION_PLANS_TABLE)
        .insert({
          id: planId,
          name: planData.name,
          description: planData.description,
          price: planData.price,
          interval: planData.interval,
          type: planData.type || 'standard',
          active: planData.active !== undefined ? planData.active : true,
          metadata: planData.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: context?.userId || null
        })
        .select()
        .single();
      
      if (planError) {
        throw planError;
      }
      
      // Add features to the plan
      if (planData.featureIds && planData.featureIds.length > 0) {
        const planFeatures = planData.featureIds.map(featureId => ({
          id: uuidv4(),
          plan_id: planId,
          feature_id: featureId,
          created_at: new Date().toISOString(),
          created_by: context?.userId || null
        }));
        
        const { error: featuresError } = await supabase
          .from(PLAN_FEATURES_TABLE)
          .insert(planFeatures);
        
        if (featuresError) {
          throw featuresError;
        }
      }
      
      // Get the full plan with features
      return await getSubscriptionPlanById(planId);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('createSubscriptionPlan', SUBSCRIPTION_PLANS_TABLE, { name: planData.name }, result);
    
    return result;
  } catch (error) {
    logger.error('Error creating subscription plan', { error: error.message, stack: error.stack, name: planData.name });
    throw error;
  }
}

/**
 * Update a subscription plan
 * @param {string} id - Plan ID
 * @param {Object} planData - Plan data to update
 * @returns {Promise<Object>} - Updated plan object
 */
export async function updateSubscriptionPlan(id, planData) {
  try {
    const operation = async () => {
      const supabase = getSupabaseAdminClient();
      
      // Update the plan
      const updateData = {
        ...planData,
        updated_at: new Date().toISOString()
      };
      
      // Remove featureIds from updateData
      const featureIds = updateData.featureIds;
      delete updateData.featureIds;
      
      const { data: plan, error: updateError } = await supabase
        .from(SUBSCRIPTION_PLANS_TABLE)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      // Add features to the plan
      if (featureIds && featureIds.length > 0) {
        const planFeatures = featureIds.map(featureId => ({
          id: uuidv4(),
          plan_id: id,
          feature_id: featureId,
          created_at: new Date().toISOString(),
          created_by: plan.created_by
        }));
        
        const { error: featuresError } = await supabase
          .from(PLAN_FEATURES_TABLE)
          .insert(planFeatures);
        
        if (featuresError) {
          throw featuresError;
        }
      }
      
      // Get the full plan with features
      return await getSubscriptionPlanById(id);
    };
    
    const result = await executeWithRetry(operation);
    
    logDatabaseOperation('updateSubscriptionPlan', SUBSCRIPTION_PLANS_TABLE, { id }, result);
    
    return result;
  } catch (error) {
    logger.error('Error updating subscription plan', { error: error.message, stack: error.stack, id });
    throw error;
  }
}

/**
 * Stub notification job processor for background jobs
 * @param {Object} job - Bull job object
 */
export async function processNotificationJob(job) {
  logger.info('processNotificationJob called', { jobId: job.id, data: job.data });
  // TODO: Implement notification logic (e.g., send email, push notification, etc.)
}
