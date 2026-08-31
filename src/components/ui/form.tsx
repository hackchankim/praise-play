"use client";

import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

// React Hook Form + Zod resolver 조합을 전제로 한 공통 폼 컴포넌트 세트.
// 사용 예:
// const form = useForm({ resolver: zodResolver(schema) });
// <Form {...form}>
//   <FormField control={form.control} name="title" render={({ field }) => (
//     <FormItem>
//       <FormLabel>제목</FormLabel>
//       <FormControl><Input {...field} /></FormControl>
//       <FormMessage />
//     </FormItem>
//   )} />
// </Form>

const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext?.name });

  if (!fieldContext) {
    throw new Error("useFormField는 <FormField> 내부에서만 사용할 수 있습니다.");
  }
  if (!itemContext) {
    throw new Error("useFormField는 <FormItem> 내부에서만 사용할 수 있습니다.");
  }

  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

interface FormItemContextValue {
  id: string;
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn("flex flex-col gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

// 단일 자식(input 등)에 접근성 속성만 주입한다. Radix Slot과 달리 wrapper 엘리먼트를 만들지
// 않으며, 자식이 이미 갖고 있는 id/aria-* 값이 있으면 그 값을 우선한다(자동 생성값으로
// 조용히 덮어쓰지 않음).
function FormControl({ children }: { children: React.ReactNode }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  if (!React.isValidElement(children)) return null;

  const child = children as React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;

  return React.cloneElement(child, {
    id: child.props.id ?? formItemId,
    "aria-describedby":
      child.props["aria-describedby"] ??
      (error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId),
    "aria-invalid": child.props["aria-invalid"] ?? !!error,
  });
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : props.children;

  if (!body) return null;

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-sm text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  useFormField,
};
