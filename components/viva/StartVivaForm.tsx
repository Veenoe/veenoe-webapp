"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner"
import { useVivaStore } from "@/lib/store/viva-store";

// 1. Define the form schema with Zod
const formSchema = z.object({
  student_name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  topic: z.string().min(3, {
    message: "Topic must be at least 3 characters.",
  }),
  class_level: z.string().min(2, {
    message: "Class level is required.",
  }),
});

type FormSchema = z.infer<typeof formSchema>;

export function StartVivaForm() {
  const router = useRouter();
//   const { toast } = useToast();
  const startSession = useVivaStore((state) => state.startSession);
  const [isLoading, setIsLoading] = useState(false);

  // 2. Set up the form with react-hook-form
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      student_name: "",
      topic: "The Indian Constitution",
      class_level: "10th Grade",
    },
  });

  // 3. Define the submit handler
  async function onSubmit(values: FormSchema) {
    setIsLoading(true);
    try {
      // 4. Call the store action
      const sessionId = await startSession({
        student_name: values.student_name,
        topic: values.topic,
        class_level: values.class_level,
      });

      // 5. Navigate to the dynamic session page on success
     toast("session created")
      router.push(`/viva/${sessionId}`);
    } catch (error) {
      // 6. Show an error toast on failure
      setIsLoading(false);
    //   toast({
    //     variant: "destructive",
    //     title: "Error Starting Session",
    //     description:
    //       error instanceof Error
    //         ? error.message
    //         : "Please check your connection and try again.",
    //   });
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle>Start Your Viva</CardTitle>
        <CardDescription>
          Enter your details to begin your AI-powered oral exam.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="student_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="topic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Photosynthesis" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="class_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class / Level</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 10th Grade" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Starting..." : "Start Session"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}