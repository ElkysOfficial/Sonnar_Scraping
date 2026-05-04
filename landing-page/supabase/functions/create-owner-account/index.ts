import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const ownerEmail = Deno.env.get("OWNER_EMAIL");
    const ownerPassword = Deno.env.get("OWNER_PASSWORD");
    const ownerFullName = Deno.env.get("OWNER_FULL_NAME") ?? "Owner";

    if (!ownerEmail || !ownerPassword) {
      console.error("OWNER_EMAIL or OWNER_PASSWORD not configured");
      return new Response(
        JSON.stringify({ error: "Owner credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      u => u.email?.toLowerCase() === ownerEmail.toLowerCase()
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`Owner user already exists: ${userId}`);
    } else {
      // Create the owner user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: {
          full_name: ownerFullName
        }
      });

      if (createError) {
        console.error("Error creating owner user:", createError);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
      console.log(`Created owner user: ${userId}`);
    }

    // Check if user already has a role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", userId)
      .single();

    if (existingRole) {
      console.log(`User already has role: ${existingRole.role}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Owner account already exists with role: ${existingRole.role}`,
          userId 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add owner role
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: 'owner'
      });

    if (insertError) {
      console.error("Error inserting owner role:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to add owner role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Owner role added for ${ownerEmail}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Owner account created successfully",
        userId 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in create-owner-account:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
